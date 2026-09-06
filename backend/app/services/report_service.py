"""Structured Chinese report + DICOM SEG/SR/GSPS export for succeeded tasks."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.enums import TaskStatus
from app.imaging.dicom_export import (
    ModelIdentity,
    build_gsps_boxes,
    build_measurement_sr,
    build_segmentation,
    load_label_stack,
    load_source_images,
    save_dataset,
)
from app.infra.orm import ArtifactRow, InstanceRow, SeriesRow, TaskRow
from app.infra.storage import StorageService

logger = logging.getLogger(__name__)

_REVIEW_LABEL = {
    "pending": "待审",
    "accepted": "已接受",
    "rejected": "已拒绝",
    "corrected": "已修正",
}


def _parse_finding_id(fid: str) -> tuple[str, str]:
    if "-" not in fid:
        raise ValueError(f"非法 finding_id: {fid}")
    kind, rest = fid.split("-", 1)
    if kind not in {"mask", "box", "prediction", "pred"}:
        raise ValueError(f"未知 finding 类型: {kind}")
    if kind == "pred":
        kind = "prediction"
    return kind, rest


def render_chinese_report(
    *,
    task: TaskRow,
    result: dict[str, Any],
    selected: list[dict[str, Any]],
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "【VoxFlow AI 结构化报告】",
        f"报告时间：{now}",
        f"任务 ID：{task.task_id}",
        f"检查 Study UID：{task.study_uid or '-'}",
        f"序列 Series UID：{task.series_uid}",
        f"模型：{task.model_id}  v{task.model_version or result.get('model_version') or '-'}",
        f"推理耗时：{result.get('runtime_ms', '-')} ms",
        "",
        "—— 结果摘要 ——",
        str(result.get("summary") or "（无）"),
        "",
    ]

    masks = [s for s in selected if s["kind"] == "mask"]
    boxes = [s for s in selected if s["kind"] == "box"]
    preds = [s for s in selected if s["kind"] == "prediction"]

    def _review_tag(item: dict[str, Any]) -> str:
        status = str(item.get("review_status") or "pending")
        return _REVIEW_LABEL.get(status, status)

    if masks:
        lines.append("一、分割发现")
        for i, m in enumerate(masks, 1):
            vol = m.get("volume_mm3")
            vol_s = f"{vol / 1000:.1f} mL" if isinstance(vol, (int, float)) else "—"
            dice = m.get("dice")
            dice_s = f"{float(dice):.3f}" if isinstance(dice, (int, float)) else "—"
            layers = m.get("slice_count")
            lines.append(
                f"  {i}. [{_review_tag(m)}] {m['label']}（label={m.get('label_id')}）"
                f" · 体积 {vol_s} · Dice {dice_s} · 层数 {layers if layers is not None else '—'}"
            )
        lines.append("")

    if boxes:
        lines.append("二、检测发现")
        for i, b in enumerate(boxes, 1):
            conf = b.get("confidence")
            conf_s = f"{float(conf) * 100:.1f}%" if isinstance(conf, (int, float)) else "—"
            diam = b.get("diameter_mm")
            diam_s = f"{float(diam):.1f} mm" if isinstance(diam, (int, float)) else "—"
            slice_i = b.get("slice_index")
            slice_s = f"#{int(slice_i) + 1}" if isinstance(slice_i, int) else "—"
            lines.append(
                f"  {i}. [{_review_tag(b)}] {b['label']} · 置信度 {conf_s} · 直径 {diam_s} · 所在层 {slice_s}"
            )
        lines.append("")

    if preds:
        lines.append("三、分类结果")
        for i, p in enumerate(preds, 1):
            prob = p.get("probability")
            prob_s = f"{float(prob) * 100:.1f}%" if isinstance(prob, (int, float)) else "—"
            lines.append(f"  {i}. [{_review_tag(p)}] {p['label']} · 概率 {prob_s}")
        lines.append("")

    if not selected:
        lines.append("（未勾选任何 finding）")
        lines.append("")
    else:
        counts = {
            "accepted": sum(1 for s in selected if s.get("review_status") == "accepted"),
            "rejected": sum(1 for s in selected if s.get("review_status") == "rejected"),
            "corrected": sum(1 for s in selected if s.get("review_status") == "corrected"),
            "pending": sum(1 for s in selected if s.get("review_status") in (None, "pending")),
        }
        lines.append("—— 审阅统计 ——")
        lines.append(
            f"接受 {counts['accepted']} · 拒绝 {counts['rejected']} · "
            f"修正 {counts['corrected']} · 待审 {counts['pending']}"
        )
        lines.append("")

    lines.extend(
        [
            "—— 导出说明 ——",
            "本报告可同步导出 DICOM SEG（分割）、SR-TID1500（测量）、GSPS（检出框），",
            "DICOM 产物仅包含已接受/已修正 findings；并在 Contributing Equipment 中写入模型身份。",
            "",
            "【免责声明】本报告由演示/科研模型自动生成，不可作为临床诊断依据。",
        ]
    )
    return "\n".join(lines)


class ReportService:
    def __init__(self, db: Session, storage: StorageService | None = None) -> None:
        self.db = db
        self.storage = storage or StorageService()

    def generate(
        self,
        task_id: str,
        finding_ids: list[str],
        *,
        reviews: list[dict[str, Any]] | None = None,
        export_seg: bool = True,
        export_sr: bool = True,
        export_gsps: bool = True,
    ) -> dict[str, Any]:
        task = self.db.scalar(select(TaskRow).where(TaskRow.task_id == task_id))
        if task is None:
            raise KeyError(task_id)
        if task.status != TaskStatus.SUCCEEDED.value or not task.result_json:
            raise LookupError(f"status={task.status}")

        result = task.result_json
        review_map = {
            str(r.get("finding_id")): str(r.get("status") or "pending")
            for r in (reviews or [])
            if r.get("finding_id")
        }
        selected = self._resolve_findings(result, finding_ids, review_map)
        if finding_ids and not selected:
            raise ValueError("finding_ids 未匹配到任何结果项")

        report_id = uuid4().hex[:12]
        out_dir = Path(task.work_dir or self.storage.task_dir(task_id)) / "output" / "reports" / report_id
        out_dir.mkdir(parents=True, exist_ok=True)

        text = render_chinese_report(task=task, result=result, selected=selected)
        text_path = out_dir / "structured_report.txt"
        text_path.write_text(text, encoding="utf-8")

        artifacts: list[dict[str, Any]] = [
            self._register_artifact(task, text_path, "text/plain", name=f"report_{report_id}.txt")
        ]

        identity = ModelIdentity(
            model_id=task.model_id,
            model_version=task.model_version or str(result.get("model_version") or "0"),
        )

        exportable = [s for s in selected if s.get("review_status") in {"accepted", "corrected"}]
        if not any(s.get("review_status") in {"accepted", "rejected", "corrected"} for s in selected):
            exportable = list(selected)

        need_dicom = export_seg or export_sr or export_gsps
        source_images: list[Any] = []
        if need_dicom and exportable:
            source_images = self._load_series_images(task.series_uid)

        mask_selected = [s for s in exportable if s["kind"] == "mask"]
        box_selected = [s for s in exportable if s["kind"] == "box"]

        if export_seg and mask_selected and source_images:
            stack_dir = self._mask_stack_dir(result)
            if stack_dir is not None:
                volume = load_label_stack(stack_dir, len(source_images), prefix="label")
                if int(volume.shape[0]) != len(source_images):
                    raise ValueError(
                        f"分割栈层数 {volume.shape[0]} 与源序列 {len(source_images)} 不一致"
                    )
                segment_defs = [(int(m["label_id"]), str(m["label"])) for m in mask_selected]
                keep = {int(m["label_id"]) for m in mask_selected}
                filtered = np_where_labels(volume, keep)
                seg = build_segmentation(
                    source_images,
                    filtered,
                    segment_defs=segment_defs,
                    identity=identity,
                )
                seg_path = out_dir / "seg.dcm"
                save_dataset(seg, seg_path)
                artifacts.append(
                    self._register_artifact(
                        task, seg_path, "application/dicom", name=f"seg_{report_id}.dcm"
                    )
                )

        if export_sr and exportable and source_images:
            measurements = []
            for s in exportable:
                item: dict[str, Any] = {
                    "label": s.get("label"),
                    "volume_mm3": s.get("volume_mm3"),
                    "diameter_mm": s.get("diameter_mm"),
                    "review_status": s.get("review_status") or "pending",
                }
                if s.get("confidence") is not None:
                    item["probability"] = s.get("confidence")
                elif s.get("probability") is not None:
                    item["probability"] = s.get("probability")
                if s.get("dice") is not None:
                    item["dice"] = s.get("dice")
                measurements.append(item)
            sr = build_measurement_sr(
                source_images, measurements=measurements, identity=identity
            )
            sr_path = out_dir / "sr.dcm"
            save_dataset(sr, sr_path)
            artifacts.append(
                self._register_artifact(
                    task, sr_path, "application/dicom", name=f"sr_{report_id}.dcm"
                )
            )

        if export_gsps and box_selected and source_images:
            gsps = build_gsps_boxes(
                source_images,
                boxes=box_selected,
                identity=identity,
            )
            gsps_path = out_dir / "gsps.dcm"
            save_dataset(gsps, gsps_path)
            artifacts.append(
                self._register_artifact(
                    task, gsps_path, "application/dicom", name=f"gsps_{report_id}.dcm"
                )
            )

        return {
            "report_id": report_id,
            "task_id": task.task_id,
            "model_id": task.model_id,
            "model_version": identity.model_version,
            "finding_ids": [s["id"] for s in selected],
            "text": text,
            "artifacts": artifacts,
        }

    def _resolve_findings(
        self,
        result: dict[str, Any],
        finding_ids: list[str],
        review_map: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        review_map = review_map or {}
        if not finding_ids:
            ids: list[str] = []
            for m in result.get("masks") or []:
                ids.append(f"mask-{m['label_id']}")
            for b in result.get("boxes") or []:
                ids.append(f"box-{b['id']}")
            for p in result.get("predictions") or []:
                ids.append(f"pred-{p['label']}")
            finding_ids = ids

        selected: list[dict[str, Any]] = []
        masks_by_id = {str(m["label_id"]): m for m in (result.get("masks") or [])}
        boxes_by_id = {str(b["id"]): b for b in (result.get("boxes") or [])}
        preds_by_label = {str(p["label"]): p for p in (result.get("predictions") or [])}

        for fid in finding_ids:
            kind, rest = _parse_finding_id(fid)
            status = review_map.get(fid, "pending")
            if kind == "mask":
                m = masks_by_id.get(rest)
                if not m:
                    continue
                selected.append(
                    {
                        "id": fid,
                        "kind": "mask",
                        "label": m.get("label_name") or f"Label-{rest}",
                        "label_id": m.get("label_id"),
                        "volume_mm3": m.get("volume_mm3"),
                        "dice": m.get("dice"),
                        "slice_count": len(m.get("slice_indices") or []),
                        "review_status": status,
                    }
                )
            elif kind == "box":
                b = boxes_by_id.get(rest)
                if not b:
                    continue
                selected.append(
                    {
                        "id": fid,
                        "kind": "box",
                        "label": b.get("label") or rest,
                        "confidence": b.get("confidence"),
                        "diameter_mm": b.get("diameter_mm"),
                        "slice_index": b.get("slice_index"),
                        "bbox": b.get("bbox"),
                        "review_status": status,
                    }
                )
            else:
                p = preds_by_label.get(rest)
                if not p:
                    continue
                selected.append(
                    {
                        "id": fid,
                        "kind": "prediction",
                        "label": p.get("label") or rest,
                        "probability": p.get("probability"),
                        "review_status": status,
                    }
                )
        return selected

    def _mask_stack_dir(self, result: dict[str, Any]) -> Path | None:
        masks = result.get("masks") or []
        if not masks:
            return None
        uri = masks[0].get("uri")
        if not uri:
            return None
        path = self.storage.resolve_uri(uri)
        if path.is_file():
            return path.parent
        if path.is_dir():
            return path
        return None

    def _load_series_images(self, series_uid: str) -> list[Any]:
        series = self.db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))
        if series is None:
            raise KeyError(f"未知序列: {series_uid}")
        rows = self.db.scalars(
            select(InstanceRow)
            .where(InstanceRow.series_uid == series_uid)
            .order_by(InstanceRow.instance_number.asc())
        ).all()
        paths = [Path(r.file_path) for r in rows]
        missing = [p for p in paths if not p.is_file()]
        if missing:
            raise FileNotFoundError(f"缺失 DICOM 文件: {missing[0]}")
        if series.num_instances and int(series.num_instances) != len(paths):
            logger.warning(
                "series_instance_count_mismatch series=%s db=%s files=%s",
                series_uid,
                series.num_instances,
                len(paths),
            )
        return load_source_images(paths)

    def _register_artifact(
        self, task: TaskRow, path: Path, media_type: str, *, name: str
    ) -> dict[str, Any]:
        existing = {a.name for a in task.artifacts}
        final_name = name
        if final_name in existing:
            stem = Path(name).stem
            suffix = Path(name).suffix
            final_name = f"{stem}_{uuid4().hex[:6]}{suffix}"

        uri = self.storage.to_uri(path)
        row = ArtifactRow(
            task_id=task.task_id,
            name=final_name,
            uri=uri,
            media_type=media_type,
            size_bytes=path.stat().st_size if path.is_file() else None,
        )
        self.db.add(row)
        self.db.flush()
        return {
            "name": final_name,
            "uri": uri,
            "media_type": media_type,
            "size_bytes": row.size_bytes,
            "url": f"/api/v1/tasks/{task.task_id}/artifacts/{final_name}",
        }


def np_where_labels(volume: Any, keep: set[int]) -> Any:
    import numpy as np

    out = np.zeros_like(volume)
    for lid in keep:
        out[volume == lid] = lid
        if lid == 1 and not np.any(out) and np.any(volume > 0):
            out[volume > 0] = 1
    return out

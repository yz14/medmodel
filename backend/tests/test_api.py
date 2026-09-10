from __future__ import annotations

import io
import json
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.infra.config import get_settings
from app.infra.db import Base, configure_engine, init_db
from app.infra.queue import reset_task_queue_for_tests
from app.main import create_app
from app.models_hub import load_all_plugins
from app.models_hub.registry import registry


@pytest.fixture()
def client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    storage_dir = tmp_path / "storage"
    db_path = data_dir / "test.db"
    data_dir.mkdir()
    storage_dir.mkdir()

    monkeypatch.setenv("VOXFLOW_DATA_DIR", str(data_dir))
    monkeypatch.setenv("VOXFLOW_STORAGE_DIR", str(storage_dir))
    monkeypatch.setenv("VOXFLOW_DATABASE_URL", f"sqlite:///{db_path.as_posix()}")
    monkeypatch.setenv("VOXFLOW_TASK_FAKE_LATENCY_SCALE", "0.05")
    monkeypatch.setenv("VOXFLOW_TASK_MAX_CONCURRENCY", "2")

    get_settings.cache_clear()
    reset_task_queue_for_tests()
    settings = get_settings()
    assert settings.storage_dir == storage_dir
    settings.ensure_dirs()
    configure_engine(settings.database_url)
    init_db()
    load_all_plugins()

    app = create_app()
    with TestClient(app) as c:
        yield c, storage_dir

    # teardown
    eng = configure_engine(settings.database_url)
    Base.metadata.drop_all(bind=eng)
    get_settings.cache_clear()
    reset_task_queue_for_tests()


def _wait_task(client: TestClient, task_id: str, timeout: float = 15.0) -> dict:
    deadline = time.time() + timeout
    detail = {}
    while time.time() < deadline:
        detail = client.get(f"/api/v1/tasks/{task_id}").json()
        if detail.get("status") in {"succeeded", "failed", "canceled"}:
            return detail
        time.sleep(0.05)
    return detail


def _chest_series_uid(c: TestClient) -> str:
    studies = c.get("/api/v1/studies").json()["items"]
    for study in studies:
        if study.get("patient_id") == "DEMO-CT-CHEST":
            return study["series"][0]["series_uid"]
        for s in study.get("series") or []:
            if (
                (s.get("modality") or "").upper() == "CT"
                and (s.get("body_part") or "").upper() == "CHEST"
                and int(s.get("num_instances") or 0) >= 8
            ):
                return s["series_uid"]
    return studies[0]["series"][0]["series_uid"]


def test_health(client):
    c, _ = client
    resp = c.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in {"ok", "degraded"}


def test_studies_last_task(client):
    """Tech debt: StudySummary.last_task reflects latest inference for the study."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()["items"]
    chest = next(s for s in studies if s.get("patient_id") == "DEMO-CT-CHEST")
    assert chest.get("last_task") is None

    series_uid = chest["series"][0]["series_uid"]
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"

    listed = c.get("/api/v1/studies").json()["items"]
    chest2 = next(s for s in listed if s["study_uid"] == chest["study_uid"])
    lt = chest2["last_task"]
    assert lt is not None
    assert lt["task_id"] == task_id
    assert lt["model_id"] == "lung_seg"
    assert lt["status"] == "succeeded"
    assert 0.0 <= float(lt["progress"]) <= 1.0

    one = c.get(f"/api/v1/studies/{chest['study_uid']}").json()
    assert one["last_task"]["task_id"] == task_id


def test_models_registered(client):
    c, _ = client
    resp = c.get("/api/v1/models")
    assert resp.status_code == 200
    ids = {m["id"] for m in resp.json()["items"]}
    assert {"lung_seg", "nodule_seg", "nodule_det", "nodule_cls"} <= ids


def test_demo_instances_and_volume_aligned(client):
    """A-1/A-3: num_instances matches files on disk and detection slice in range."""
    c, storage = client
    studies = c.get("/api/v1/studies").json()
    assert studies["total"] >= 1
    chest = next(
        (
            s
            for s in studies["items"]
            if s.get("patient_id") == "DEMO-CT-CHEST"
            or (
                (s.get("body_part") or "").upper() == "CHEST"
                and s.get("modality") == "CT"
                and int((s.get("series") or [{}])[0].get("num_instances") or 0) >= 8
            )
        ),
        studies["items"][0],
    )
    series = chest["series"][0]
    assert series["num_instances"] == 40

    series_uid = series["series_uid"]
    instances = c.get(f"/api/v1/series/{series_uid}/instances").json()
    assert instances["total"] == 40

    # disk: only ingested NNNN_*.dcm, no duplicate IMG*
    series_dirs = list((storage / "studies").rglob("series"))
    assert series_dirs
    dcm_files = list(Path(series["thumbnail_url"] and storage).glob("**/*.dcm")) if False else []
    # locate series storage via API frame path existence
    from app.infra.db import SessionLocal
    from app.infra.orm import SeriesRow
    from sqlalchemy import select
    from app.infra import db as db_mod

    assert db_mod.SessionLocal is not None
    with db_mod.SessionLocal() as db:
        row = db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))
        assert row is not None
        series_path = Path(row.storage_path)
    ingested = list(series_path.glob("[0-9][0-9][0-9][0-9]_*.dcm"))
    imgs = list(series_path.glob("IMG*.dcm"))
    assert len(ingested) == 40
    assert len(imgs) == 0

    # run detection — slice_index must be in [0, 39]
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_det", "params": {}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded", detail
    result = c.get(f"/api/v1/tasks/{task_id}/result").json()
    assert result["type"] == "detection"
    for box in result["boxes"]:
        assert 0 <= int(box["slice_index"]) < 40


def test_inference_and_idempotent_cache(client):
    c, _ = client
    series_uid = _chest_series_uid(c)

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"
    result = c.get(f"/api/v1/tasks/{task_id}/result").json()
    assert result["type"] == "segmentation"
    assert len(result["masks"]) >= 1

    create2 = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert create2.status_code == 202
    assert create2.json()["cache_hit"] is True


def test_sse_progress_and_succeeded(client):
    """A-2: SSE must emit progress and terminal succeeded."""
    c, _ = client
    series_uid = _chest_series_uid(c)

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 1.1}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    assert create.json()["cache_hit"] is False

    events: list[dict] = []
    deadline = time.time() + 20
    with c.stream("GET", f"/api/v1/tasks/{task_id}/events") as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if time.time() > deadline:
                break
            if not line or not line.startswith("data:"):
                continue
            payload = json.loads(line[len("data:") :].strip())
            events.append(payload)
            if payload.get("type") in {"succeeded", "failed", "canceled"}:
                break

    types = [e.get("type") for e in events]
    assert "progress" in types, types
    assert "succeeded" in types, types
    # also ensure task row succeeded
    assert _wait_task(c, task_id)["status"] == "succeeded"

def test_error_body_unified(client):
    """A-8: HTTPException returns flat {code,message,trace_id}."""
    c, _ = client
    resp = c.get("/api/v1/models/does_not_exist")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" not in body
    assert body["code"] == "MODEL_NOT_FOUND"
    assert "message" in body
    assert "trace_id" in body


def test_artifact_path_traversal_rejected(client):
    """A-4: traversal names rejected."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 0.9}},
    )
    task_id = create.json()["task_id"]
    _wait_task(c, task_id)

    # Path segments with ".." must be rejected (URL "/artifacts/.." is normalized by the client).
    resp = c.get(f"/api/v1/tasks/{task_id}/artifacts/foo..bar")
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_ARTIFACT_NAME"

    resp2 = c.get(f"/api/v1/tasks/{task_id}/artifacts/not_registered.bin")
    assert resp2.status_code == 404

    # Unit-level: safe_join rejects traversal
    from app.infra.storage import StorageService

    storage = StorageService()
    root = storage.settings.storage_dir
    with pytest.raises(ValueError):
        storage.safe_join_under(root, "..", "etc", "passwd")

def test_zip_slip_rejected(client, tmp_path):
    """A-5: zip-slip entries rejected."""
    c, _ = client
    evil = tmp_path / "evil.zip"
    with zipfile.ZipFile(evil, "w") as zf:
        zf.writestr("../evil.dcm", b"not-a-dicom")

    with evil.open("rb") as fh:
        resp = c.post(
            "/api/v1/studies/upload",
            files=[("files", ("evil.zip", fh, "application/zip"))],
        )
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] in {"UPLOAD_INVALID", "HTTP_ERROR"}
    assert "不安全" in body["message"] or "ZIP" in body["message"]


def test_unknown_model_and_disabled(client):
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)

    resp = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nope", "params": {}},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"

    c.patch("/api/v1/models/lung_seg", json={"enabled": False})
    resp2 = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert resp2.status_code == 400
    c.patch("/api/v1/models/lung_seg", json={"enabled": True})


def test_cancel_and_retry(client):
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)
    # use params that avoid cache; wait longer for cancel race
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_seg", "params": {"max_nodules": 4}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    if create.json().get("cache_hit"):
        # still exercise retry path
        retry = c.post(f"/api/v1/tasks/{task_id}/retry")
        assert retry.status_code == 202
        detail = _wait_task(c, retry.json()["task_id"])
        assert detail["status"] == "succeeded"
        return

    cancel = c.post(f"/api/v1/tasks/{task_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] in {"canceled", "succeeded", "running", "queued", "failed"}

    retry = c.post(f"/api/v1/tasks/{task_id}/retry")
    assert retry.status_code == 202
    new_id = retry.json()["task_id"]
    detail = _wait_task(c, new_id)
    assert detail["status"] == "succeeded"


def test_mask_frame_endpoint(client):
    """R2: mask PNG stack is served per slice."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {"smooth": True}},
    )
    assert create.status_code == 202, create.text
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"
    assert detail.get("stage_timings")
    assert "preprocess" in detail["stage_timings"]
    result = c.get(f"/api/v1/tasks/{task_id}/result").json()
    assert result["masks"]
    # pick a slice that has lung
    indices = result["masks"][0].get("slice_indices") or []
    assert indices, result["masks"][0]
    idx = indices[0]
    resp = c.get(f"/api/v1/tasks/{task_id}/mask-frames/{idx}?prefix=label")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert len(resp.content) > 100


def test_invalid_params_rejected(client):
    """B-3: params must satisfy model params_schema."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)
    resp = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {"hu_low": "not-a-number"}},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body.get("code") == "BAD_REQUEST" or "参数" in str(body)


def test_inflight_dedup(client):
    """B-4: concurrent same-params creates reuse in-flight task id."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)
    body = {"series_uid": series_uid, "model_id": "nodule_det", "params": {}}
    a = c.post("/api/v1/tasks", json=body)
    b = c.post("/api/v1/tasks", json=body)
    assert a.status_code == 202
    assert b.status_code == 202
    assert a.json()["task_id"] == b.json()["task_id"]
    detail = _wait_task(c, a.json()["task_id"])
    assert detail["status"] == "succeeded"


def test_health_live_ready_and_model_ready(client):
    """C-5: Triton-style live/ready probes + model ready."""
    c, _ = client
    live = c.get("/api/v1/health/live")
    assert live.status_code == 200
    assert live.json()["status"] == "ok"
    ready = c.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    mr = c.get("/api/v1/models/lung_seg/ready")
    assert mr.status_code == 200
    body = mr.json()
    assert body["ready"] is True
    assert body["model_id"] == "lung_seg"


def test_structured_report_and_dicom_export(client):
    """C-6: Chinese report + SEG/SR for lung_seg; GSPS for nodule_det."""
    import pydicom

    c, storage = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"
    result = c.get(f"/api/v1/tasks/{task_id}/result").json()
    finding_ids = [f"mask-{m['label_id']}" for m in result["masks"]]

    report = c.post(
        f"/api/v1/tasks/{task_id}/reports",
        json={
            "finding_ids": finding_ids,
            "export_seg": True,
            "export_sr": True,
            "export_gsps": False,
        },
    )
    assert report.status_code == 200, report.text
    body = report.json()
    assert "结构化报告" in body["text"] or "VoxFlow" in body["text"]
    names = {a["name"] for a in body["artifacts"]}
    assert any(n.endswith(".txt") for n in names)
    assert any(n.startswith("seg_") and n.endswith(".dcm") for n in names)
    assert any(n.startswith("sr_") and n.endswith(".dcm") for n in names)

    seg_name = next(n for n in names if n.startswith("seg_"))
    seg_resp = c.get(f"/api/v1/tasks/{task_id}/artifacts/{seg_name}")
    assert seg_resp.status_code == 200
    out = Path(storage) / seg_name
    out.write_bytes(seg_resp.content)
    ds = pydicom.dcmread(str(out))
    assert ds.SOPClassUID  # Segmentation Storage
    assert "1.2.840.10008.5.1.4.1.1.66.4" in str(ds.SOPClassUID)
    assert hasattr(ds, "ContributingEquipmentSequence")
    ce_blob = str(ds.ContributingEquipmentSequence)
    assert "lung_seg" in ce_blob or "Processing Equipment" in ce_blob
    assert "VoxFlow" in ce_blob

    # GSPS path via detection model
    create2 = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_det", "params": {}},
    )
    tid2 = create2.json()["task_id"]
    assert _wait_task(c, tid2)["status"] == "succeeded"
    det = c.get(f"/api/v1/tasks/{tid2}/result").json()
    box_ids = [f"box-{b['id']}" for b in det["boxes"][:2]]
    report2 = c.post(
        f"/api/v1/tasks/{tid2}/reports",
        json={"finding_ids": box_ids, "export_seg": False, "export_sr": True, "export_gsps": True},
    )
    assert report2.status_code == 200, report2.text
    names2 = {a["name"] for a in report2.json()["artifacts"]}
    assert any(n.startswith("gsps_") for n in names2)


def test_registry_len():
    assert len(registry) >= 4


def test_storage_isolated_from_repo(client, tmp_path):
    """A-9: writes go to tmp storage, not project storage."""
    _, storage = client
    assert storage == tmp_path / "storage" or str(storage).startswith(str(tmp_path))
    studies = Path(storage) / "studies"
    assert studies.exists()
    # project root storage should not be required
    repo_storage = Path(__file__).resolve().parents[2].parent / "storage"
    # if repo storage exists from prior runs, our test UIDs should not appear there as the only source
    assert get_settings().storage_dir == storage


def test_heal_stale_num_instances(client):
    """N-B1: stale num_instances=0 is corrected by heal on ensure_demo_data / startup."""
    c, _ = client
    from sqlalchemy import select

    from app.infra.db import SessionLocal
    from app.infra.orm import SeriesRow, StudyRow
    from app.services.study_service import StudyService

    assert SessionLocal is not None
    chest_uid = _chest_series_uid(c)
    with SessionLocal() as db:
        series = db.scalar(select(SeriesRow).where(SeriesRow.series_uid == chest_uid))
        assert series is not None
        series.num_instances = 0
        study = db.scalar(select(StudyRow).where(StudyRow.study_uid == series.study_uid))
        assert study is not None
        study.num_instances = 0
        db.commit()

        fixed = StudyService(db).heal_instance_counts()
        db.commit()
        assert fixed >= 1
        db.refresh(series)
        assert series.num_instances == 40

    studies = c.get("/api/v1/studies").json()
    chest = next(s for s in studies["items"] if any(x["series_uid"] == chest_uid for x in s.get("series") or []))
    assert next(x for x in chest["series"] if x["series_uid"] == chest_uid)["num_instances"] == 40


def test_cache_hit_artifacts_downloadable(client):
    """N-B2: cache_hit copies ArtifactRow so artifact download works."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {"smooth": False}},
    )
    assert create.status_code == 202
    first_id = create.json()["task_id"]
    first = _wait_task(c, first_id)
    assert first["status"] == "succeeded"
    assert first["artifacts"], first
    art_name = first["artifacts"][0]["name"]
    art1 = c.get(f"/api/v1/tasks/{first_id}/artifacts/{art_name}")
    assert art1.status_code == 200

    create2 = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {"smooth": False}},
    )
    assert create2.status_code == 202
    body2 = create2.json()
    assert body2["cache_hit"] is True
    second_id = body2["task_id"]
    second = c.get(f"/api/v1/tasks/{second_id}").json()
    assert second["cache_hit"] is True
    assert second["artifacts"], second
    assert any(a["name"] == art_name for a in second["artifacts"])
    art2 = c.get(f"/api/v1/tasks/{second_id}/artifacts/{art_name}")
    assert art2.status_code == 200
    assert len(art2.content) == len(art1.content)


def test_cancel_not_overwritten_by_succeeded(client, monkeypatch):
    """N-B3: cancel + optimistic lock — terminal status must be canceled, not succeeded."""
    monkeypatch.setenv("VOXFLOW_TASK_FAKE_LATENCY_SCALE", "2.0")
    get_settings.cache_clear()

    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = _chest_series_uid(c)

    create = c.post(
        "/api/v1/tasks",
        json={
            "series_uid": series_uid,
            "model_id": "nodule_seg",
            "params": {"max_nodules": 5, "min_diameter_mm": 4.7},
        },
    )
    assert create.status_code == 202, create.text
    assert create.json().get("cache_hit") is False
    task_id = create.json()["task_id"]

    # Wait until worker has picked it up
    deadline = time.time() + 5
    while time.time() < deadline:
        st = c.get(f"/api/v1/tasks/{task_id}").json()["status"]
        if st == "running":
            break
        if st in {"succeeded", "failed", "canceled"}:
            break
        time.sleep(0.02)

    cancel = c.post(f"/api/v1/tasks/{task_id}/cancel")
    assert cancel.status_code == 200

    detail = _wait_task(c, task_id, timeout=30.0)
    assert detail["status"] == "canceled", detail


def test_timestamps_serialized_with_utc_z(client):
    """N-B4: API datetimes end with Z (UTC), never naive local."""
    from datetime import datetime, timezone

    from app.infra.timeutil import utc_iso

    naive = datetime(2026, 9, 5, 4, 5, 26)
    assert utc_iso(naive) == "2026-09-05T04:05:26Z"
    aware = datetime(2026, 9, 5, 12, 5, 26, tzinfo=timezone.utc)
    assert utc_iso(aware) == "2026-09-05T12:05:26Z"

    c, _ = client
    studies = c.get("/api/v1/studies").json()
    created = studies["items"][0]["created_at"]
    assert created.endswith("Z"), created
    assert "+" not in created.split("T")[-1].replace("Z", "")

    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 1.42}},
    )
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["created_at"].endswith("Z")
    if detail.get("finished_at"):
        assert detail["finished_at"].endswith("Z")


def test_cls_det_metrics_no_zero_dice(client):
    """N-F12 companion: classification/detection specs expose AUC/mAP, not dice=0."""
    c, _ = client
    models = {m["id"]: m for m in c.get("/api/v1/models").json()["items"]}
    assert "dice" not in models["nodule_cls"]["metrics"]
    assert models["nodule_cls"]["metrics"].get("auc", 0) > 0
    assert "dice" not in models["nodule_det"]["metrics"]
    assert models["nodule_det"]["metrics"].get("map", 0) > 0


def test_stats_overview_real_series(client):
    """FE-5: overview exposes daily_tasks + per-model usage from real task rows."""
    c, _ = client
    empty = c.get("/api/v1/stats/overview").json()
    assert len(empty["daily_tasks"]) == 14
    assert empty["daily_tasks"][-1]["total"] == 0
    assert empty["model_usage"] == []
    assert empty["kpis"]["success_rate"] is None
    assert any(m["task_type"] == "detection" for m in empty["model_metrics"])
    det = next(m for m in empty["model_metrics"] if m["id"] == "nodule_det")
    assert "map" in det["metrics"]
    assert "dice" not in det["metrics"]

    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    _wait_task(c, create.json()["task_id"])

    stats = c.get("/api/v1/stats/overview").json()
    assert stats["kpis"]["today_tasks"] >= 1
    assert stats["kpis"]["success_rate"] == 1.0
    assert stats["daily_tasks"][-1]["total"] >= 1
    assert stats["daily_tasks"][-1]["succeeded"] >= 1
    usage = {u["model_id"]: u for u in stats["model_usage"]}
    assert "lung_seg" in usage
    assert usage["lung_seg"]["succeeded"] >= 1


def test_multi_modal_demo_catalog(client):
    """N-B9: demo catalog includes CT chest/head, MR brain, DR chest."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    pids = {s["patient_id"] for s in studies["items"]}
    assert {"DEMO-CT-CHEST", "DEMO-CT-HEAD", "DEMO-MR-BRAIN", "DEMO-DR-CHEST"} <= pids
    assert studies["total"] >= 4


def test_input_constraints_reject_mr(client):
    """N-B6: lung models rejected on MR with UNSUPPORTED_INPUT."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()["items"]
    mr = next(s for s in studies if s.get("patient_id") == "DEMO-MR-BRAIN")
    series_uid = mr["series"][0]["series_uid"]
    resp = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "UNSUPPORTED_INPUT"


def test_input_constraints_reject_head_body_part(client):
    """N-B6: chest-only models rejected on HEAD CT."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()["items"]
    head = next(s for s in studies if s.get("patient_id") == "DEMO-CT-HEAD")
    series_uid = head["series"][0]["series_uid"]
    resp = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_det", "params": {}},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "UNSUPPORTED_INPUT"


def test_planted_nodules_detection_in_range(client):
    """N-B9: det boxes land on valid slices; phantom_meta sidecar present."""
    c, storage = client
    series_uid = _chest_series_uid(c)
    from app.infra.db import SessionLocal
    from app.infra.orm import SeriesRow
    from sqlalchemy import select

    assert SessionLocal is not None
    with SessionLocal() as db:
        row = db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))
        assert row is not None
        meta = Path(row.storage_path) / "phantom_meta.json"
        assert meta.is_file()
        import json

        planted = json.loads(meta.read_text(encoding="utf-8")).get("nodules") or []
        assert len(planted) >= 1

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_det", "params": {"score_threshold": 0.2}},
    )
    assert create.status_code == 202
    detail = _wait_task(c, create.json()["task_id"])
    assert detail["status"] == "succeeded"
    result = c.get(f"/api/v1/tasks/{detail['task_id']}/result").json()
    assert result["boxes"]
    for box in result["boxes"]:
        assert 0 <= int(box["slice_index"]) < 40


def test_task_search_and_model_filter(client):
    """R11: tasks list supports q search + model_id filter."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 1.05}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"

    by_model = c.get("/api/v1/tasks", params={"model_id": "nodule_cls"})
    assert by_model.status_code == 200
    assert any(t["task_id"] == task_id for t in by_model.json()["items"])

    by_q = c.get("/api/v1/tasks", params={"q": "nodule_cls"})
    assert by_q.status_code == 200
    assert any(t["task_id"] == task_id for t in by_q.json()["items"])

    by_tid = c.get("/api/v1/tasks", params={"q": task_id[:8]})
    assert by_tid.status_code == 200
    assert any(t["task_id"] == task_id for t in by_tid.json()["items"])


def test_report_reviews_and_sr_probability_semantics(client):
    """R11/N-B7: reviews in Chinese report; SR uses DCM.Probability + review QualEval."""
    import pydicom
    from highdicom.sr.utils import find_content_items
    from pydicom.sr.codedict import codes

    c, storage = client
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_det", "params": {}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    assert _wait_task(c, task_id)["status"] == "succeeded"
    det = c.get(f"/api/v1/tasks/{task_id}/result").json()
    assert det["boxes"]
    box_ids = [f"box-{b['id']}" for b in det["boxes"]]
    reviews = [
        {"finding_id": box_ids[0], "status": "accepted"},
        *[{"finding_id": fid, "status": "rejected"} for fid in box_ids[1:]],
    ]

    report = c.post(
        f"/api/v1/tasks/{task_id}/reports",
        json={
            "finding_ids": box_ids,
            "reviews": reviews,
            "export_seg": False,
            "export_sr": True,
            "export_gsps": True,
        },
    )
    assert report.status_code == 200, report.text
    body = report.json()
    assert "已接受" in body["text"]
    assert "审阅统计" in body["text"]
    names = {a["name"] for a in body["artifacts"]}
    assert any(n.startswith("sr_") for n in names)

    sr_name = next(n for n in names if n.startswith("sr_"))
    sr_resp = c.get(f"/api/v1/tasks/{task_id}/artifacts/{sr_name}")
    assert sr_resp.status_code == 200
    out = Path(storage) / sr_name
    out.write_bytes(sr_resp.content)
    ds = pydicom.dcmread(str(out))
    assert "1.2.840.10008.5.1.4.1.1.88.33" in str(ds.SOPClassUID)

    probs = find_content_items(ds, name=codes.DCM.Probability, recursive=True)
    assert probs, "SR must contain DCM.Probability numeric items"

    blob = str(ds)
    assert "VF.REVIEW" in blob or "Review Status" in blob
    assert "VF.ACCEPTED" in blob or "Accepted" in blob


def test_metrics_endpoint(client):
    """R12: Prometheus text metrics expose queue + task counters."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 1.11}},
    )
    _wait_task(c, create.json()["task_id"])

    resp = c.get("/api/v1/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers.get("content-type", "")
    body = resp.text
    assert "voxflow_queue_queued" in body
    assert "voxflow_tasks_total" in body
    assert "voxflow_models_registered" in body


def test_task_trace_id_propagated(client):
    """R12: create_task stores X-Trace-Id for worker correlation."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    create = c.post(
        "/api/v1/tasks",
        headers={"X-Trace-Id": "r12traceabc"},
        json={"series_uid": series_uid, "model_id": "nodule_cls", "params": {"temperature": 1.12}},
    )
    assert create.status_code == 202
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"
    assert detail.get("trace_id") == "r12traceabc"


def test_concurrent_idempotent_create(client):
    """N-B10: parallel create for same series/model/params shares one inflight task_id."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    c, _ = client
    series_uid = _chest_series_uid(c)
    body = {
        "series_uid": series_uid,
        "model_id": "nodule_cls",
        "params": {"temperature": 1.333},
    }

    def _post():
        return c.post("/api/v1/tasks", json=body)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(_post) for _ in range(4)]
        results = [f.result() for f in as_completed(futures)]

    assert all(r.status_code == 202 for r in results), [r.text for r in results]
    ids = {r.json()["task_id"] for r in results}
    assert len(ids) == 1, ids
    detail = _wait_task(c, next(iter(ids)))
    assert detail["status"] == "succeeded"


def test_upload_rejects_too_many_files(client, monkeypatch):
    """N-B5: max_upload_files → 413."""
    monkeypatch.setenv("VOXFLOW_MAX_UPLOAD_FILES", "1")
    get_settings.cache_clear()

    c, _ = client
    files = [
        ("a.dcm", b"not-really-dicom-1", "application/dicom"),
        ("b.dcm", b"not-really-dicom-2", "application/dicom"),
    ]
    resp = c.post(
        "/api/v1/studies/upload",
        files=[("files", f) for f in files],
    )
    assert resp.status_code == 413, resp.text
    assert resp.json()["code"] == "UPLOAD_TOO_MANY_FILES"
    get_settings.cache_clear()


def test_upload_rejects_too_large(client, monkeypatch):
    """N-B5: max_upload_bytes → 413."""
    monkeypatch.setenv("VOXFLOW_MAX_UPLOAD_BYTES", "32")
    get_settings.cache_clear()

    c, _ = client
    payload = b"x" * 64
    resp = c.post(
        "/api/v1/studies/upload",
        files=[("files", ("big.bin", payload, "application/octet-stream"))],
    )
    assert resp.status_code == 413, resp.text
    assert resp.json()["code"] == "UPLOAD_TOO_LARGE"
    get_settings.cache_clear()


def test_inflight_dedup_single_worker_claim(client, monkeypatch):
    """TODO-1 #1: same-params double POST must not run the worker twice."""
    monkeypatch.setenv("VOXFLOW_TASK_FAKE_LATENCY_SCALE", "1.5")
    get_settings.cache_clear()

    c, _ = client
    series_uid = _chest_series_uid(c)
    body = {"series_uid": series_uid, "model_id": "lung_seg", "params": {"hu_low": -999}}
    first = c.post("/api/v1/tasks", json=body)
    second = c.post("/api/v1/tasks", json=body)
    assert first.status_code == 202 and second.status_code == 202
    assert first.json()["task_id"] == second.json()["task_id"]
    task_id = first.json()["task_id"]
    detail = _wait_task(c, task_id, timeout=30.0)
    assert detail["status"] == "succeeded"
    full = c.get(f"/api/v1/tasks/{task_id}").json()
    claim_logs = [log for log in full.get("logs") or [] if "领取" in (log.get("message") or "")]
    assert len(claim_logs) == 1, full.get("logs")
    get_settings.cache_clear()


def test_volume_read_failed_non_phantom(client):
    """TODO-1 #3: non-phantom series with unreadable volume must fail (no random fallback)."""
    from sqlalchemy import select

    from app.infra import db as db_mod
    from app.infra.orm import SeriesRow

    c, _ = client
    series_uid = _chest_series_uid(c)
    assert db_mod.SessionLocal is not None
    with db_mod.SessionLocal() as db:
        row = db.scalar(select(SeriesRow).where(SeriesRow.series_uid == series_uid))
        assert row is not None
        row.is_phantom = False
        row.storage_path = str(Path("/nonexistent/voxflow/series"))
        db.commit()

    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {}},
    )
    assert create.status_code == 202
    detail = _wait_task(c, create.json()["task_id"])
    assert detail["status"] == "failed"
    assert detail.get("error_code") == "VOLUME_READ_FAILED"


def test_instances_ordered_by_slice_index(client):
    """TODO-1 #2: /instances frame order follows stable slice_index (IPP-backed)."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    resp = c.get(f"/api/v1/series/{series_uid}/instances")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 2
    indexes = [it["slice_index"] for it in items]
    assert indexes == list(range(len(items)))
    # Demo chest has ascending IPP; positions should be monotonic when present
    positions = [it.get("slice_position") for it in items if it.get("slice_position") is not None]
    if len(positions) >= 2:
        assert positions == sorted(positions)


def test_reconcile_after_restart_marks_running(client):
    """TODO-1 #8: running tasks become INTERRUPTED; queued ids returned for re-enqueue."""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from app.infra import db as db_mod
    from app.infra.orm import TaskRow
    from app.services.task_service import TaskService

    c, _ = client
    series_uid = _chest_series_uid(c)
    assert db_mod.SessionLocal is not None
    with db_mod.SessionLocal() as db:
        svc = TaskService(db)
        running = TaskRow(
            task_id="reconcile_running_1",
            series_uid=series_uid,
            study_uid=None,
            model_id="lung_seg",
            model_version="0.0.0",
            params={},
            params_hash="reconcile-hash-running",
            status="running",
            stage="infer",
            progress=0.4,
            message="interrupted mid-flight",
            started_at=datetime.now(timezone.utc),
        )
        queued = TaskRow(
            task_id="reconcile_queued_1",
            series_uid=series_uid,
            study_uid=None,
            model_id="nodule_det",
            model_version="0.0.0",
            params={},
            params_hash="reconcile-hash-queued",
            status="queued",
            stage="queued",
            progress=0.0,
            message="waiting",
        )
        db.add(running)
        db.add(queued)
        db.commit()
        ids = svc.reconcile_after_restart()
        db.commit()
        assert "reconcile_queued_1" in ids
        assert "reconcile_running_1" not in ids
        row = db.scalar(select(TaskRow).where(TaskRow.task_id == "reconcile_running_1"))
        assert row is not None
        assert row.status == "failed"
        assert row.error_code == "INTERRUPTED"


def test_decoded_pixel_frame_endpoint(client):
    """TODO-1 #4: /frames/{idx}/pixel returns float32 + metadata headers."""
    import numpy as np

    c, _ = client
    series_uid = _chest_series_uid(c)
    resp = c.get(f"/api/v1/series/{series_uid}/frames/0/pixel")
    assert resp.status_code == 200, resp.text
    assert resp.headers.get("X-VoxFlow-Dtype") == "float32"
    width = int(resp.headers["X-VoxFlow-Width"])
    height = int(resp.headers["X-VoxFlow-Height"])
    assert width > 0 and height > 0
    arr = np.frombuffer(resp.content, dtype="<f4")
    assert arr.size == width * height
    assert np.isfinite(arr).all()


def test_series_spacing_z_from_ipp(client):
    """TODO-1 #22: demo chest spacing_z follows IPP gap (~1.25), not only SliceThickness."""
    c, _ = client
    series_uid = _chest_series_uid(c)
    series = c.get(f"/api/v1/series/{series_uid}").json()
    spacing = series.get("spacing") or []
    assert len(spacing) >= 1
    z = spacing[0]
    assert z is not None
    assert abs(float(z) - 1.25) < 0.05


def test_zip_extract_respects_budget(tmp_path, monkeypatch):
    """TODO-1 #17: zip bomb / oversized uncompressed payload is rejected."""
    import zipfile

    from app.imaging.dicom_io import _extract_zip_dicoms

    monkeypatch.setenv("VOXFLOW_MAX_UPLOAD_BYTES", "1024")
    get_settings.cache_clear()

    zpath = tmp_path / "bomb.zip"
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("big.dcm", b"0" * 4096)

    try:
        _extract_zip_dicoms(zpath, max_uncompressed_bytes=1024)
        ok = True
    except ValueError as exc:
        ok = False
        assert "解压" in str(exc) or "限制" in str(exc)
    assert ok is False
    get_settings.cache_clear()


def test_upload_preserves_relative_path_collision(client):
    """TODO-1 #16: same basename under different folders does not overwrite."""
    import shutil
    import tempfile

    from app.services.study_service import _safe_upload_relpath

    root = Path(tempfile.mkdtemp(prefix="voxflow_rel_"))
    try:
        a = _safe_upload_relpath(root, "folder_a/1.dcm")
        a.parent.mkdir(parents=True, exist_ok=True)
        a.write_bytes(b"aaa")
        b = _safe_upload_relpath(root, "folder_b/1.dcm")
        b.parent.mkdir(parents=True, exist_ok=True)
        b.write_bytes(b"bbb")
        assert a != b
        assert a.read_bytes() == b"aaa"
        assert b.read_bytes() == b"bbb"
        # same relative path twice → uniquify
        cpath = _safe_upload_relpath(root, "folder_a/1.dcm")
        assert cpath != a
        assert cpath.name.startswith("1_")
    finally:
        shutil.rmtree(root, ignore_errors=True)


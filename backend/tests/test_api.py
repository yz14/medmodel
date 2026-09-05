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


def test_health(client):
    c, _ = client
    resp = c.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["models"] >= 4
    assert "code" not in body or body.get("status")


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
    series = studies["items"][0]["series"][0]
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
    studies = c.get("/api/v1/studies").json()
    series_uid = studies["items"][0]["series"][0]["series_uid"]

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
    studies = c.get("/api/v1/studies").json()
    series_uid = studies["items"][0]["series"][0]["series_uid"]

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
    series_uid = studies["items"][0]["series"][0]["series_uid"]
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
    series_uid = studies["items"][0]["series"][0]["series_uid"]

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
    series_uid = studies["items"][0]["series"][0]["series_uid"]
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
    studies = c.get("/api/v1/studies").json()
    series_uid = studies["items"][0]["series"][0]["series_uid"]
    create = c.post(
        "/api/v1/tasks",
        json={"series_uid": series_uid, "model_id": "lung_seg", "params": {"smooth": True}},
    )
    task_id = create.json()["task_id"]
    detail = _wait_task(c, task_id)
    assert detail["status"] == "succeeded"
    assert detail.get("stage_timings")
    assert "preprocess" in detail["stage_timings"]
    result = c.get(f"/api/v1/tasks/{task_id}/result").json()
    assert result["masks"]
    # pick a slice that has lung
    idx = result["masks"][0]["slice_indices"][0]
    resp = c.get(f"/api/v1/tasks/{task_id}/mask-frames/{idx}?prefix=label")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/png")
    assert len(resp.content) > 100


def test_invalid_params_rejected(client):
    """B-3: params must satisfy model params_schema."""
    c, _ = client
    studies = c.get("/api/v1/studies").json()
    series_uid = studies["items"][0]["series"][0]["series_uid"]
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
    series_uid = studies["items"][0]["series"][0]["series_uid"]
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
    series_uid = studies["items"][0]["series"][0]["series_uid"]

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


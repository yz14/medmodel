"""DICOM SEG / SR-TID1500 / GSPS exporters (highdicom).

Model identity is recorded via ContributingEquipment + AlgorithmIdentification.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import highdicom as hd
import numpy as np
import pydicom
from highdicom.base_content import ContributingEquipment
from highdicom.content import AlgorithmIdentificationSequence
from highdicom.pr import (
    AnnotationUnitsValues,
    GraphicAnnotation,
    GraphicLayer,
    GraphicObject,
    GraphicTypeValues,
    GrayscaleSoftcopyPresentationState,
)
from highdicom.seg import SegmentDescription, Segmentation, SegmentationTypeValues
from highdicom.seg.enum import SegmentAlgorithmTypeValues
from highdicom.sr import (
    ComprehensiveSR,
    DeviceObserverIdentifyingAttributes,
    Measurement,
    MeasurementReport,
    MeasurementsAndQualitativeEvaluations,
    ObservationContext,
    ObserverContext,
    TrackingIdentifier,
)
from PIL import Image
from pydicom.sr.codedict import codes
from pydicom.uid import generate_uid


@dataclass(frozen=True, slots=True)
class ModelIdentity:
    model_id: str
    model_version: str
    manufacturer: str = "VoxFlow"
    device_serial: str = "voxflow-demo-001"


def load_source_images(paths: Sequence[Path]) -> list[pydicom.Dataset]:
    images: list[pydicom.Dataset] = []
    shared_for: str | None = None
    for path in paths:
        ds = pydicom.dcmread(str(path), force=True)
        _ensure_type2_patient_attrs(ds)
        existing = getattr(ds, "FrameOfReferenceUID", None)
        if existing:
            shared_for = shared_for or str(existing)
        images.append(ds)
    if not images:
        raise ValueError("无源影像实例")
    shared_for = shared_for or generate_uid()
    for ds in images:
        ds.FrameOfReferenceUID = shared_for
    return images


def _ensure_type2_patient_attrs(ds: pydicom.Dataset) -> None:
    """Fill Type 2 attributes commonly required by highdicom IODs."""
    defaults: dict[str, Any] = {
        "PatientBirthDate": "",
        "PatientSex": "O",
        "PatientName": "Anonymous",
        "PatientID": "UNKNOWN",
        "AccessionNumber": "",
        "StudyID": "",
        "StudyDate": "",
        "StudyTime": "",
        "SeriesDate": "",
        "SeriesTime": "",
        "ContentDate": "",
        "ContentTime": "",
        "SeriesNumber": 1,
        "InstanceNumber": 1,
        "PatientOrientation": "",
        "Laterality": "",
        "ImageComments": "",
        "Manufacturer": "VoxFlow",
        "ManufacturerModelName": "DemoCT",
        "DeviceSerialNumber": "demo",
        "SoftwareVersions": "1.0",
        "PositionReferenceIndicator": "",
    }
    for key, value in defaults.items():
        if not hasattr(ds, key) or getattr(ds, key) is None:
            setattr(ds, key, value)


def load_label_stack(stack_dir: Path, num_slices: int, prefix: str = "label") -> np.ndarray:
    """Load PNG label stack → (Z,H,W) uint8."""
    planes: list[np.ndarray] = []
    for idx in range(num_slices):
        path = stack_dir / f"{prefix}_{idx:04d}.png"
        if path.is_file():
            arr = np.array(Image.open(path).convert("L"), dtype=np.uint8)
        else:
            # fall back to empty plane matching first loaded or 256²
            h = planes[0].shape[0] if planes else 256
            w = planes[0].shape[1] if planes else 256
            arr = np.zeros((h, w), dtype=np.uint8)
        planes.append(arr)
    return np.stack(planes, axis=0)


def model_contributing_equipment(identity: ModelIdentity) -> ContributingEquipment:
    return ContributingEquipment(
        manufacturer=identity.manufacturer,
        purpose_of_reference=codes.DCM.ProcessingEquipment,
        manufacturer_model_name=identity.model_id,
        software_versions=identity.model_version,
        device_serial_number=identity.device_serial,
        institution_name="VoxFlow Demo Hospital",
        institutional_department_name="AI Imaging",
        contribution_datetime=datetime.now(timezone.utc),
        contribution_description=f"AI inference by {identity.model_id}@{identity.model_version}",
    )


def build_segmentation(
    source_images: Sequence[pydicom.Dataset],
    label_volume: np.ndarray,
    *,
    segment_defs: Sequence[tuple[int, str]],
    identity: ModelIdentity,
) -> Segmentation:
    """Create BINARY SEG from multi-label volume; segment_defs = (label_id, label_name)."""
    if label_volume.ndim != 3:
        raise ValueError("label_volume must be (Z,H,W)")
    if label_volume.shape[0] != len(source_images):
        raise ValueError(
            f"掩膜层数 {label_volume.shape[0]} 与源影像 {len(source_images)} 不一致"
        )

    algorithm = AlgorithmIdentificationSequence(
        name=identity.model_id,
        family=codes.cid7162.ArtificialIntelligence,
        version=identity.model_version,
        source=identity.manufacturer,
    )

    descriptions: list[SegmentDescription] = []
    binary_planes: list[np.ndarray] = []
    for number, (label_id, label_name) in enumerate(segment_defs, start=1):
        binary = (label_volume == int(label_id)).astype(np.uint8)
        if not np.any(binary) and int(label_id) == 1 and np.any(label_volume > 0):
            # lung_seg label stack is often 0/1 binary rather than label_id values
            binary = (label_volume > 0).astype(np.uint8)
        binary_planes.append(binary)
        descriptions.append(
            SegmentDescription(
                segment_number=number,
                segment_label=label_name[:64],
                segmented_property_category=codes.SCT.AnatomicalStructure,
                segmented_property_type=codes.SCT.Tissue,
                algorithm_type=SegmentAlgorithmTypeValues.AUTOMATIC,
                algorithm_identification=algorithm,
                tracking_id=f"{identity.model_id}-{label_id}",
                tracking_uid=generate_uid(),
            )
        )

    # highdicom expects (segments, rows, cols) or per-frame; use stacked (Z,H,W) with
    # one segment → pass binary; multi-segment → (Z,H,W,segments) last axis.
    if len(binary_planes) == 1:
        pixel_array = binary_planes[0]
    else:
        pixel_array = np.stack(binary_planes, axis=-1)

    return Segmentation(
        source_images=list(source_images),
        pixel_array=pixel_array,
        segmentation_type=SegmentationTypeValues.BINARY,
        segment_descriptions=descriptions,
        series_instance_uid=generate_uid(),
        series_number=9001,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer=identity.manufacturer,
        manufacturer_model_name=identity.model_id,
        software_versions=identity.model_version,
        device_serial_number=identity.device_serial,
        content_description=f"VoxFlow SEG {identity.model_id}",
        content_label="AI_SEG",
        omit_empty_frames=True,
        contributing_equipment=[model_contributing_equipment(identity)],
    )


def build_measurement_sr(
    source_images: Sequence[pydicom.Dataset],
    *,
    measurements: Sequence[dict[str, Any]],
    identity: ModelIdentity,
) -> ComprehensiveSR:
    """TID1500 ComprehensiveSR from selected findings (volume / diameter / probability)."""
    device_uid = generate_uid()
    observer = ObserverContext(
        observer_type=codes.DCM.Device,
        observer_identifying_attributes=DeviceObserverIdentifyingAttributes(
            uid=device_uid,
            name=identity.model_id,
            manufacturer_name=identity.manufacturer,
            model_name=identity.model_id,
            serial_number=identity.device_serial,
        ),
    )
    observation_context = ObservationContext(observer_device_context=observer)

    groups: list[MeasurementsAndQualitativeEvaluations] = []
    for item in measurements:
        label = str(item.get("label") or "Finding")
        tracking = TrackingIdentifier(uid=generate_uid(), identifier=label[:64])
        meas_list: list[Measurement] = []
        if item.get("volume_mm3") is not None:
            meas_list.append(
                Measurement(
                    name=codes.SCT.Volume,
                    value=float(item["volume_mm3"]),
                    unit=codes.UCUM.CubicMillimeter,
                )
            )
        if item.get("diameter_mm") is not None:
            meas_list.append(
                Measurement(
                    name=codes.SCT.Diameter,
                    value=float(item["diameter_mm"]),
                    unit=codes.UCUM.Millimeter,
                )
            )
        if item.get("confidence") is not None:
            meas_list.append(
                Measurement(
                    name=codes.DCM.Finding,
                    value=float(item["confidence"]),
                    unit=codes.UCUM.NoUnits,
                )
            )
        if not meas_list:
            continue
        groups.append(
            MeasurementsAndQualitativeEvaluations(
                tracking_identifier=tracking,
                finding_type=codes.SCT.Lesion,
                measurements=meas_list,
            )
        )

    if not groups:
        # At least one empty-safe measurement group so SR validates
        groups.append(
            MeasurementsAndQualitativeEvaluations(
                tracking_identifier=TrackingIdentifier(
                    uid=generate_uid(), identifier="summary"
                ),
                finding_type=codes.SCT.Lesion,
                measurements=[
                    Measurement(
                        name=codes.DCM.Finding,
                        value=float(len(measurements)),
                        unit=codes.UCUM.NoUnits,
                    )
                ],
            )
        )

    report = MeasurementReport(
        observation_context=observation_context,
        procedure_reported=codes.LN.CTUnspecifiedBodyRegion,
        imaging_measurements=groups,
        title=codes.DCM.ImagingMeasurementReport,
    )

    return ComprehensiveSR(
        evidence=list(source_images),
        content=report,
        series_instance_uid=generate_uid(),
        series_number=9002,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer=identity.manufacturer,
        institution_name="VoxFlow Demo Hospital",
        institutional_department_name="AI Imaging",
        series_description=f"VoxFlow SR {identity.model_id}",
        contributing_equipment=[model_contributing_equipment(identity)],
    )


def build_gsps_boxes(
    source_images: Sequence[pydicom.Dataset],
    *,
    boxes: Sequence[dict[str, Any]],
    identity: ModelIdentity,
) -> GrayscaleSoftcopyPresentationState:
    """GSPS with rectangle overlays for detection boxes (pixel coords)."""
    layer = GraphicLayer(layer_name="AI_BOXES", order=1, description="VoxFlow detections")

    # group boxes by slice → annotation per referenced image
    by_slice: dict[int, list[dict[str, Any]]] = {}
    for box in boxes:
        si = box.get("slice_index")
        if si is None or box.get("bbox") is None:
            continue
        by_slice.setdefault(int(si), []).append(box)

    annotations: list[GraphicAnnotation] = []
    for slice_index, items in by_slice.items():
        if slice_index < 0 or slice_index >= len(source_images):
            continue
        graphics: list[GraphicObject] = []
        for box in items:
            x, y, w, h = [float(v) for v in box["bbox"][:4]]
            # POLYLINE closed rectangle in PIXEL units
            data = np.array(
                [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
                dtype=np.float64,
            )
            graphics.append(
                GraphicObject(
                    graphic_type=GraphicTypeValues.POLYLINE,
                    graphic_data=data,
                    units=AnnotationUnitsValues.PIXEL,
                    is_filled=False,
                    tracking_id=str(box.get("id") or box.get("label") or "box")[:64],
                    tracking_uid=generate_uid(),
                )
            )
        if graphics:
            annotations.append(
                GraphicAnnotation(
                    referenced_images=[source_images[slice_index]],
                    graphic_layer=layer,
                    graphic_objects=graphics,
                )
            )

    return GrayscaleSoftcopyPresentationState(
        referenced_images=list(source_images),
        series_instance_uid=generate_uid(),
        series_number=9003,
        sop_instance_uid=generate_uid(),
        instance_number=1,
        manufacturer=identity.manufacturer,
        manufacturer_model_name=identity.model_id,
        software_versions=identity.model_version,
        device_serial_number=identity.device_serial,
        content_label="AI_GSPS",
        content_description=f"VoxFlow GSPS {identity.model_id}",
        graphic_layers=[layer],
        graphic_annotations=annotations or None,
        institution_name="VoxFlow Demo Hospital",
        institutional_department_name="AI Imaging",
        series_description=f"VoxFlow GSPS {identity.model_id}",
        contributing_equipment=[model_contributing_equipment(identity)],
    )


def save_dataset(ds: pydicom.Dataset, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    ds.save_as(str(path), enforce_file_format=True)
    return path

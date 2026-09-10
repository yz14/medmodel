"""Validate series against ModelSpec.input_constraints / modalities / body_parts (N-B6)."""

from __future__ import annotations

from typing import Any

from app.domain.contracts import ModelSpec
from app.domain.enums import Modality


class UnsupportedInputError(ValueError):
    """Raised when series does not satisfy model input constraints."""

    def __init__(self, message: str, *, code: str = "UNSUPPORTED_INPUT") -> None:
        super().__init__(message)
        self.code = code


def _as_mod_set(values: list[Any] | None) -> set[str]:
    out: set[str] = set()
    for v in values or []:
        if isinstance(v, Modality):
            out.add(v.value)
        else:
            out.add(str(v).upper())
    return out


def check_input_constraints(
    spec: ModelSpec,
    *,
    modality: str | None,
    body_part: str | None,
    num_instances: int,
) -> None:
    constraints = spec.input_constraints or {}
    allowed = _as_mod_set(list(spec.modalities))
    allowed |= _as_mod_set(list(constraints.get("modality") or []))
    mod = (modality or "").upper()
    if allowed:
        if not mod:
            raise UnsupportedInputError(
                f"模型 {spec.id} 需要已知模态（允许: {', '.join(sorted(allowed))}），当前序列模态缺失"
            )
        if mod not in allowed:
            raise UnsupportedInputError(
                f"模型 {spec.id} 不支持模态 {mod}（允许: {', '.join(sorted(allowed))}）"
            )

    min_slices = constraints.get("min_slices")
    if min_slices is not None:
        try:
            need = int(min_slices)
        except (TypeError, ValueError):
            need = 0
        if num_instances < need:
            raise UnsupportedInputError(
                f"模型 {spec.id} 需要至少 {need} 层，当前序列仅 {num_instances} 层"
            )

    allowed_parts = {str(p).upper() for p in (spec.body_parts or [])}
    constraint_parts = constraints.get("body_part") or constraints.get("body_parts")
    if constraint_parts:
        if isinstance(constraint_parts, str):
            allowed_parts |= {constraint_parts.upper()}
        else:
            allowed_parts |= {str(p).upper() for p in constraint_parts}
    part = (body_part or "").upper()
    if allowed_parts:
        if not part:
            raise UnsupportedInputError(
                f"模型 {spec.id} 需要已知部位（允许: {', '.join(sorted(allowed_parts))}），当前序列部位缺失"
            )
        if part not in allowed_parts:
            raise UnsupportedInputError(
                f"模型 {spec.id} 不适用于部位 {part}（允许: {', '.join(sorted(allowed_parts))}）"
            )

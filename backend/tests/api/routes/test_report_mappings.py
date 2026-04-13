"""Tests for Report Sheet Mapping APIs: single update, batch update."""

import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models_report import (
    ReportModule,
    ReportSheetMapping,
    ReportTemplate,
    SheetWriteModeEnum,
)


def _base(module_id: str, template_id: str) -> str:
    return f"{settings.API_V1_STR}/report-modules/{module_id}/templates/{template_id}/mappings"


def _create_module_template_mappings(
    db: Session, *, mapping_count: int = 2
) -> tuple[ReportModule, ReportTemplate, list[ReportSheetMapping]]:
    """Create a report module, template, and N mappings for testing."""
    mod = ReportModule(
        name=f"test-mod-{uuid.uuid4().hex[:8]}",
        minio_datasource_id=uuid.uuid4(),
        sql_datasource_id=uuid.uuid4(),
        default_template_bucket="tpl",
        default_output_bucket="out",
    )
    db.add(mod)
    db.flush()

    tpl = ReportTemplate(
        report_module_id=mod.id,
        name=f"test-tpl-{uuid.uuid4().hex[:8]}",
        output_bucket="out",
    )
    db.add(tpl)
    db.flush()

    mappings = []
    for i in range(mapping_count):
        m = ReportSheetMapping(
            report_template_id=tpl.id,
            sort_order=i,
            sheet_name=f"Sheet{i + 1}",
            start_cell="A1",
            write_mode=SheetWriteModeEnum.ROWS,
            write_headers=False,
            sql_content=f"SELECT {i + 1}",
        )
        db.add(m)
        mappings.append(m)
    db.commit()
    for m in mappings:
        db.refresh(m)
    db.refresh(tpl)
    db.refresh(mod)
    return mod, tpl, mappings


# ---------------------------------------------------------------------------
# Single update
# ---------------------------------------------------------------------------


def test_update_mapping_success(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    mod, tpl, mappings = _create_module_template_mappings(db, mapping_count=1)
    mapping = mappings[0]

    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/update",
        headers=superuser_token_headers,
        json={
            "id": str(mapping.id),
            "sql_content": "SELECT 999",
            "sheet_name": "UpdatedSheet",
            "sort_order": 5,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sql_content"] == "SELECT 999"
    assert data["sheet_name"] == "UpdatedSheet"
    assert data["sort_order"] == 5
    # unchanged fields
    assert data["start_cell"] == "A1"
    assert data["write_mode"] == "rows"


def test_update_mapping_not_found(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    mod, tpl, _ = _create_module_template_mappings(db, mapping_count=0)
    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/update",
        headers=superuser_token_headers,
        json={"id": str(uuid.uuid4()), "sql_content": "SELECT 1"},
    )
    assert resp.status_code == 404


def test_update_mapping_wrong_template(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Mapping belongs to tpl1, but request targets tpl2 → 404."""
    mod, tpl1, mappings = _create_module_template_mappings(db, mapping_count=1)
    tpl2 = ReportTemplate(
        report_module_id=mod.id,
        name=f"tpl2-{uuid.uuid4().hex[:8]}",
        output_bucket="out",
    )
    db.add(tpl2)
    db.commit()
    db.refresh(tpl2)

    resp = client.post(
        f"{_base(str(mod.id), str(tpl2.id))}/update",
        headers=superuser_token_headers,
        json={"id": str(mappings[0].id), "sql_content": "SELECT 1"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Batch update
# ---------------------------------------------------------------------------


def test_batch_update_mappings_success(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    mod, tpl, mappings = _create_module_template_mappings(db, mapping_count=3)

    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/batch-update",
        headers=superuser_token_headers,
        json={
            "mappings": [
                {"id": str(mappings[0].id), "sql_content": "SELECT 'a'", "sort_order": 10},
                {"id": str(mappings[1].id), "sheet_name": "Renamed", "write_headers": True},
                {"id": str(mappings[2].id), "is_active": False},
            ]
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3

    by_id = {d["id"]: d for d in data}
    assert by_id[str(mappings[0].id)]["sql_content"] == "SELECT 'a'"
    assert by_id[str(mappings[0].id)]["sort_order"] == 10
    assert by_id[str(mappings[1].id)]["sheet_name"] == "Renamed"
    assert by_id[str(mappings[1].id)]["write_headers"] is True
    assert by_id[str(mappings[2].id)]["is_active"] is False


def test_batch_update_empty_list(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    mod, tpl, _ = _create_module_template_mappings(db, mapping_count=0)

    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/batch-update",
        headers=superuser_token_headers,
        json={"mappings": []},
    )
    assert resp.status_code == 400


def test_batch_update_one_not_found_rolls_back(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """If any mapping in the batch is invalid, none should be updated."""
    mod, tpl, mappings = _create_module_template_mappings(db, mapping_count=1)
    original_sql = mappings[0].sql_content

    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/batch-update",
        headers=superuser_token_headers,
        json={
            "mappings": [
                {"id": str(mappings[0].id), "sql_content": "SELECT 'changed'"},
                {"id": str(uuid.uuid4()), "sql_content": "SELECT 'ghost'"},
            ]
        },
    )
    assert resp.status_code == 404

    # Verify first mapping was NOT changed (rollback)
    db.refresh(mappings[0])
    assert mappings[0].sql_content == original_sql


def test_batch_update_unauthorized(
    client: TestClient, db: Session
) -> None:
    mod, tpl, mappings = _create_module_template_mappings(db, mapping_count=1)

    resp = client.post(
        f"{_base(str(mod.id), str(tpl.id))}/batch-update",
        json={
            "mappings": [
                {"id": str(mappings[0].id), "sql_content": "SELECT 1"},
            ]
        },
    )
    assert resp.status_code == 401

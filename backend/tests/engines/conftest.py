"""Clean up report tables after engine tests to avoid FK violations in global teardown."""
import pytest
from sqlalchemy import delete
from sqlmodel import Session

from app.models_report import (
    ReportExecution,
    ReportModule,
    ReportModuleClientLink,
    ReportSheetMapping,
    ReportTemplate,
    ReportTemplateClientLink,
)


@pytest.fixture(autouse=True, scope="session")
def _cleanup_report_tables(db: Session):
    yield
    for model in [
        ReportExecution,
        ReportSheetMapping,
        ReportTemplateClientLink,
        ReportTemplate,
        ReportModuleClientLink,
        ReportModule,
    ]:
        db.execute(delete(model))
    db.commit()

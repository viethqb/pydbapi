# VersionCommit Implementation Plan

## Overview

The VersionCommit feature enables:

- Automatically save version history when updating API content
- View version history of an API assignment
- View details of a specific version (including content snapshot)
- Rollback to an older version
- Manual commit with commit message

---

## PHASE 1: Backend - Schemas & Models

### 1.1 Schemas (backend/app/schemas_dbapi.py)

**Add new schemas:**

```python
# Full schema for VersionCommit (includes content_snapshot)
class VersionCommitDetail(SQLModel):
    """Full VersionCommit schema with content_snapshot."""
    id: uuid.UUID
    api_assignment_id: uuid.UUID
    version: int
    content_snapshot: str  # Full content
    commit_message: str | None
    committed_at: datetime

# Schema for manual version commit creation
class VersionCommitCreate(SQLModel):
    """Body for POST /api-assignments/{id}/versions/create."""
    commit_message: str | None = Field(default=None, max_length=512)

# Schema for rollback
class VersionCommitRollbackIn(SQLModel):
    """Body for POST /api-assignments/{id}/versions/{version_id}/rollback."""
    pass  # No body needed, version_id in path

# Response schema for listing versions
class VersionCommitListOut(SQLModel):
    """Response for GET /api-assignments/{id}/versions."""
    data: list[VersionCommitPublic]  # Reuse existing schema
    total: int
```

**Keep existing:**

- `VersionCommitPublic` (already exists, without content_snapshot)
- `RecentCommitsOut` (already exists in overview)

---

## PHASE 2: Backend - Auto-create VersionCommit Logic

### 2.1 Update function in api_assignments.py

**File:** `backend/app/api/routes/api_assignments.py`

**Modify the `update_api_assignment` function:**

1. **Before updating content:**
   - Get current ApiContext (if exists)
   - Get the highest version of this API assignment
   - Compare old content vs new content

2. **After successfully updating content:**
   - If content changed:
     - Create new VersionCommit with:
       - `version = max_version + 1`
       - `content_snapshot = old_content` (content before update)
       - `commit_message = None` (or can auto-generate)
       - `committed_at = now()`

**Logic:**

```python
def _create_version_commit_if_content_changed(
    session: Session,
    api_assignment_id: uuid.UUID,
    old_content: str | None,
    new_content: str | None,
) -> None:
    """Create VersionCommit if content changed."""
    if old_content == new_content:
        return  # No change

    # Get max version
    max_version_stmt = (
        select(func.max(VersionCommit.version))
        .where(VersionCommit.api_assignment_id == api_assignment_id)
    )
    max_version = session.exec(max_version_stmt).one() or 0

    # Create new version commit with OLD content
    version_commit = VersionCommit(
        api_assignment_id=api_assignment_id,
        version=max_version + 1,
        content_snapshot=old_content or "",
        commit_message=None,  # Auto-commit, no message
    )
    session.add(version_commit)
```

**Integrate into `update_api_assignment`:**

- Call this function before updating ApiContext.content

---

## PHASE 3: Backend - Version Management Endpoints

### 3.1 New endpoints in api_assignments.py

**1. List versions of an API assignment:**

```python
@router.get("/{id}/versions", response_model=VersionCommitListOut)
def list_api_assignment_versions(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> Any:
    """List all versions of an API assignment."""
    # Check API exists
    api = session.get(ApiAssignment, id)
    if not api:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Pagination
    offset = (page - 1) * page_size

    # Count total
    count_stmt = (
        select(func.count())
        .select_from(VersionCommit)
        .where(VersionCommit.api_assignment_id == id)
    )
    total = session.exec(count_stmt).one()

    # Get versions (newest first)
    stmt = (
        select(VersionCommit)
        .where(VersionCommit.api_assignment_id == id)
        .order_by(VersionCommit.version.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = session.exec(stmt).all()

    return VersionCommitListOut(
        data=[_to_version_commit_public(v) for v in rows],
        total=total,
    )
```

**2. Get detail of a version (including content_snapshot):**

```python
@router.get("/{id}/versions/{version_id}", response_model=VersionCommitDetail)
def get_version_commit_detail(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    version_id: uuid.UUID,
) -> Any:
    """Get detail of a specific version commit (includes content_snapshot)."""
    # Check API exists
    api = session.get(ApiAssignment, id)
    if not api:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Get version commit
    vc = session.get(VersionCommit, version_id)
    if not vc or vc.api_assignment_id != id:
        raise HTTPException(status_code=404, detail="VersionCommit not found")

    return VersionCommitDetail(
        id=vc.id,
        api_assignment_id=vc.api_assignment_id,
        version=vc.version,
        content_snapshot=vc.content_snapshot,
        commit_message=vc.commit_message,
        committed_at=vc.committed_at,
    )
```

**3. Create version commit manually:**

```python
@router.post("/{id}/versions/create", response_model=VersionCommitPublic)
def create_version_commit(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    body: VersionCommitCreate,
) -> Any:
    """Manually create a version commit from current content."""
    # Check API exists
    api = session.get(ApiAssignment, id)
    if not api:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Get current ApiContext content
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == id)
    ).first()

    if not ctx or not ctx.content:
        raise HTTPException(
            status_code=400,
            detail="API has no content to commit",
        )

    # Get max version
    max_version_stmt = (
        select(func.max(VersionCommit.version))
        .where(VersionCommit.api_assignment_id == id)
    )
    max_version = session.exec(max_version_stmt).one() or 0

    # Create version commit
    vc = VersionCommit(
        api_assignment_id=id,
        version=max_version + 1,
        content_snapshot=ctx.content,
        commit_message=body.commit_message,
    )
    session.add(vc)
    session.commit()
    session.refresh(vc)

    return _to_version_commit_public(vc)
```

**4. Rollback to a version:**

```python
@router.post("/{id}/versions/{version_id}/rollback", response_model=ApiAssignmentPublic)
def rollback_to_version(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    version_id: uuid.UUID,
) -> Any:
    """Rollback API content to a specific version."""
    # Check API exists
    api = session.get(ApiAssignment, id)
    if not api:
        raise HTTPException(status_code=404, detail="ApiAssignment not found")

    # Get version commit
    vc = session.get(VersionCommit, version_id)
    if not vc or vc.api_assignment_id != id:
        raise HTTPException(status_code=404, detail="VersionCommit not found")

    # Get or create ApiContext
    ctx = session.exec(
        select(ApiContext).where(ApiContext.api_assignment_id == id)
    ).first()

    # Save current content as new version BEFORE rollback
    if ctx and ctx.content:
        max_version_stmt = (
            select(func.max(VersionCommit.version))
            .where(VersionCommit.api_assignment_id == id)
        )
        max_version = session.exec(max_version_stmt).one() or 0

        # Only create version if current content differs from rollback target
        if ctx.content != vc.content_snapshot:
            backup_vc = VersionCommit(
                api_assignment_id=id,
                version=max_version + 1,
                content_snapshot=ctx.content,
                commit_message=f"Backup before rollback to version {vc.version}",
            )
            session.add(backup_vc)

    # Rollback: restore content from version commit
    if ctx:
        ctx.content = vc.content_snapshot
        ctx.updated_at = datetime.now(timezone.utc)
        session.add(ctx)
    else:
        ctx = ApiContext(
            api_assignment_id=id,
            content=vc.content_snapshot,
        )
        session.add(ctx)

    # Update ApiAssignment updated_at
    api.updated_at = datetime.now(timezone.utc)
    session.add(api)
    session.commit()
    session.refresh(api)

    return _to_public(api)
```

**Helper function:**

```python
def _to_version_commit_public(v: VersionCommit) -> VersionCommitPublic:
    """Convert VersionCommit to VersionCommitPublic."""
    return VersionCommitPublic(
        id=v.id,
        api_assignment_id=v.api_assignment_id,
        version=v.version,
        commit_message=v.commit_message,
        committed_at=v.committed_at,
    )
```

---

## PHASE 4: Frontend - Service Layer

### 4.1 Update api-assignments.ts

**File:** `frontend/src/services/api-assignments.ts`

**Add types:**

```typescript
export type VersionCommitPublic = {
  id: string;
  api_assignment_id: string;
  version: number;
  commit_message: string | null;
  committed_at: string;
};

export type VersionCommitDetail = VersionCommitPublic & {
  content_snapshot: string;
};

export type VersionCommitListOut = {
  data: VersionCommitPublic[];
  total: number;
};

export type VersionCommitCreate = {
  commit_message?: string | null;
};
```

**Add methods to ApiAssignmentsService:**

```typescript
export const ApiAssignmentsService = {
  // ... existing methods ...

  // List versions of an API assignment
  listVersions: async (
    id: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<VersionCommitListOut> => {
    return request<VersionCommitListOut>(
      `/api/v1/api-assignments/${id}/versions?page=${page}&page_size=${pageSize}`,
      { method: "GET" },
    );
  },

  // Get version detail
  getVersion: async (
    id: string,
    versionId: string,
  ): Promise<VersionCommitDetail> => {
    return request<VersionCommitDetail>(
      `/api/v1/api-assignments/${id}/versions/${versionId}`,
      { method: "GET" },
    );
  },

  // Create version commit manually
  createVersion: async (
    id: string,
    body: VersionCommitCreate,
  ): Promise<VersionCommitPublic> => {
    return request<VersionCommitPublic>(
      `/api/v1/api-assignments/${id}/versions/create`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  // Rollback to version
  rollbackToVersion: async (
    id: string,
    versionId: string,
  ): Promise<ApiAssignmentPublic> => {
    return request<ApiAssignmentPublic>(
      `/api/v1/api-assignments/${id}/versions/${versionId}/rollback`,
      { method: "POST" },
    );
  },
};
```

---

## PHASE 5: Frontend - UI Components

### 5.1 Version History Tab in API Detail Page

**File:** `frontend/src/routes/_layout/api-dev/apis/$id.tsx`

**Add new "Version History" tab:**

1. **Add state:**

```typescript
const [versionsPage, setVersionsPage] = useState(1);
const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
const [versionDetail, setVersionDetail] = useState<VersionCommitDetail | null>(
  null,
);
```

2. **Add query to fetch versions:**

```typescript
const { data: versionsData, isLoading: versionsLoading } = useQuery({
  queryKey: ["api-assignment-versions", id, versionsPage],
  queryFn: () => ApiAssignmentsService.listVersions(id, versionsPage, 10),
  enabled: !!apiDetail,
});
```

3. **Add mutation for rollback:**

```typescript
const rollbackMutation = useMutation({
  mutationFn: (versionId: string) =>
    ApiAssignmentsService.rollbackToVersion(id, versionId),
  onSuccess: () => {
    showSuccessToast("Rolled back successfully");
    queryClient.invalidateQueries({ queryKey: ["api-assignment", id] });
    queryClient.invalidateQueries({
      queryKey: ["api-assignment-versions", id],
    });
    setSelectedVersion(null);
    setVersionDetail(null);
  },
  onError: (error: Error) => {
    showErrorToast(error.message);
  },
});
```

4. **Add mutation for create version:**

```typescript
const createVersionMutation = useMutation({
  mutationFn: (commitMessage: string | null) =>
    ApiAssignmentsService.createVersion(id, { commit_message: commitMessage }),
  onSuccess: () => {
    showSuccessToast("Version created successfully");
    queryClient.invalidateQueries({
      queryKey: ["api-assignment-versions", id],
    });
  },
  onError: (error: Error) => {
    showErrorToast(error.message);
  },
});
```

5. **Add new TabsContent:**

```tsx
<TabsContent value="versions" className="mt-6">
  <div className="space-y-4">
    {/* Header with Create Version button */}
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">Version History</h3>
        <p className="text-sm text-muted-foreground">
          View and manage API content versions
        </p>
      </div>
      <Button
        onClick={() => {
          // Show dialog to enter commit message
          const msg = prompt("Commit message (optional):");
          if (msg !== null) {
            createVersionMutation.mutate(msg || null);
          }
        }}
        disabled={createVersionMutation.isPending}
      >
        <Plus className="mr-2 h-4 w-4" />
        Create Version
      </Button>
    </div>

    {/* Versions List */}
    {versionsLoading ? (
      <div className="text-center py-8 text-muted-foreground">Loading...</div>
    ) : versionsData && versionsData.data.length > 0 ? (
      <div className="space-y-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Commit Message</TableHead>
              <TableHead>Committed At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versionsData.data.map((version) => (
              <TableRow key={version.id}>
                <TableCell>
                  <Badge variant="outline">v{version.version}</Badge>
                </TableCell>
                <TableCell>
                  {version.commit_message || (
                    <span className="text-muted-foreground italic">
                      Auto-commit
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(version.committed_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Fetch version detail
                        ApiAssignmentsService.getVersion(id, version.id).then(
                          (detail) => {
                            setVersionDetail(detail);
                            setSelectedVersion(version.id);
                          },
                        );
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Rollback to version ${version.version}? Current content will be backed up.`,
                          )
                        ) {
                          rollbackMutation.mutate(version.id);
                        }
                      }}
                      disabled={rollbackMutation.isPending}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Rollback
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {versionsData.total > 10 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVersionsPage((p) => Math.max(1, p - 1))}
              disabled={versionsPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground py-2">
              Page {versionsPage} of {Math.ceil(versionsData.total / 10)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setVersionsPage((p) =>
                  p < Math.ceil(versionsData.total / 10) ? p + 1 : p,
                )
              }
              disabled={versionsPage >= Math.ceil(versionsData.total / 10)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    ) : (
      <div className="text-center py-8 text-muted-foreground">
        No versions yet. Create one to start tracking changes.
      </div>
    )}

    {/* Version Detail Dialog */}
    {selectedVersion && versionDetail && (
      <Dialog
        open={!!selectedVersion}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVersion(null);
            setVersionDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              Version {versionDetail.version} - Content Snapshot
            </DialogTitle>
            <DialogDescription>
              Committed at:{" "}
              {new Date(versionDetail.committed_at).toLocaleString()}
              {versionDetail.commit_message && (
                <>
                  <br />
                  Message: {versionDetail.commit_message}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <div className="p-4 bg-muted rounded-md">
              <pre className="font-mono text-sm whitespace-pre-wrap break-all">
                {versionDetail.content_snapshot}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedVersion(null);
                setVersionDetail(null);
              }}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (
                  confirm(
                    `Rollback to version ${versionDetail.version}? Current content will be backed up.`,
                  )
                ) {
                  rollbackMutation.mutate(versionDetail.id);
                }
              }}
              disabled={rollbackMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Rollback to This Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
  </div>
</TabsContent>
```

6. **Update TabsList to add "Version History" tab:**

```tsx
<TabsList className="grid w-full grid-cols-4">
  <TabsTrigger value="configuration">API Configuration</TabsTrigger>
  <TabsTrigger value="content">API Execution Content</TabsTrigger>
  <TabsTrigger value="versions">Version History</TabsTrigger>
  <TabsTrigger value="testing">API Testing</TabsTrigger>
</TabsList>
```

---

## PHASE 6: Testing

### 6.1 Backend Tests

**File:** `backend/tests/api/routes/test_api_assignments.py`

**Add test cases:**

1. **Test auto-create version on content update:**

```python
def test_update_content_creates_version_commit(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Updating API content should create a VersionCommit."""
    # Create API with content
    api = create_random_assignment(db)
    ctx = ApiContext(api_assignment_id=api.id, content="SELECT 1")
    db.add(ctx)
    db.commit()

    # Update content
    response = client.post(
        f"{_base()}/update",
        headers=superuser_token_headers,
        json={
            "id": str(api.id),
            "content": "SELECT 2",
        },
    )
    assert response.status_code == 200

    # Check version commit was created
    vc = db.exec(
        select(VersionCommit).where(VersionCommit.api_assignment_id == api.id)
    ).first()
    assert vc is not None
    assert vc.version == 1
    assert vc.content_snapshot == "SELECT 1"  # Old content
```

2. **Test list versions:**
3. **Test get version detail:**
4. **Test create version manually:**
5. **Test rollback:**

### 6.2 Frontend Tests (E2E with Playwright)

**File:** `frontend/tests/` (create new if not exists)

**Test scenarios:**

1. Navigate to API detail → Version History tab
2. Create version manually
3. View version detail
4. Rollback to version
5. Verify content changed after rollback

---

## PHASE 7: Documentation & Polish

### 7.1 Update API Documentation

- Update OpenAPI schema (automatically when generating)
- Add descriptions for new endpoints

### 7.2 UI/UX Improvements

- Add loading states
- Add error handling
- Add confirmation dialogs for rollback
- Add success/error toasts
- Improve version list UI (timeline view?)
- Add diff view (compare between versions)

---

## Implementation Order

1. ✅ **Phase 1:** Schemas (Backend)
2. ✅ **Phase 2:** Auto-create version logic (Backend)
3. ✅ **Phase 3:** Endpoints (Backend)
4. ✅ **Phase 4:** Service layer (Frontend)
5. ✅ **Phase 5:** UI Components (Frontend)
6. ✅ **Phase 6:** Testing
7. ✅ **Phase 7:** Documentation & Polish

---

## Notes

- **Version numbering:** Starts from 1, auto-increments
- **Content snapshot:** Saves content BEFORE update (old content)
- **Rollback:** Automatically backs up current content before rollback
- **Auto-commit:** When updating content, automatically creates version (no commit message needed)
- **Manual commit:** User can create version with commit message
- **Performance:** Pagination for version list (default 20 items/page)

---

## Future Enhancements (Optional)

1. **Diff view:** Compare content between 2 versions
2. **Version tags:** Mark important versions
3. **Bulk operations:** Rollback multiple APIs at once
4. **Version export/import:** Export version history
5. **Version comments:** Add comments for each version
6. **Version restore:** Restore only params or only content
7. **Version search:** Search within commit messages

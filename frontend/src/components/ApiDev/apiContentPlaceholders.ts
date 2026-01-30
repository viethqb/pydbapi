/**
 * Placeholder / example snippets for API content (SQL, Script) and Result transform.
 * Used in API create, edit, and detail views.
 */

export const SQL_CONTENT_PLACEHOLDER =
  "SELECT id, name, status FROM users\n" +
  "{% where %}\n" +
  "  {% if ids %}id IN {{ ids | in_list }}{% endif %}\n" +
  "  {% if q %}AND name ILIKE {{ q | sql_like }}{% endif %}\n" +
  "{% endwhere %}\n" +
  "ORDER BY id DESC\n" +
  "LIMIT {{ limit | sql_int }} OFFSET {{ offset | sql_int }};"

export const SCRIPT_CONTENT_PLACEHOLDER =
  "def execute(params=None):\n" +
  '    """result = {success, message, data}. Append to result["data"], add result["total"], return result."""\n' +
  "    params = params or {}\n" +
  '    sql = "SELECT 1 AS col"\n' +
  "    rows = db.query(sql)\n" +
  '    result["data"].append(rows)\n' +
  "    return result\n"

export const RESULT_TRANSFORM_PLACEHOLDER =
  "def transform(result, params=None):\n" +
  '    """Transform raw executor result. Optional: params = request params dict."""\n' +
  "    # Examples: wrap in {data}, pick fields, add computed fields, filter rows\n" +
  "    return result\n"

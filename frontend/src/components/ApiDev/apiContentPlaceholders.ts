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
  "user_id = req.get(\"user_id\")\n" +
  "if not user_id:\n" +
  "    result = {\"error\": \"user_id is required\"}\n" +
  "else:\n" +
  "    row = db.query_one(\"SELECT id, name, email FROM users WHERE id = %s\", (user_id,))\n" +
  "    result = {\"user\": row} if row else {\"error\": \"Not found\"}"

export const RESULT_TRANSFORM_PLACEHOLDER =
  "def transform(result, params=None):\n" +
  '    """Transform raw executor result. Optional: params = request params dict."""\n' +
  "    # Examples: wrap in {data}, pick fields, add computed fields, filter rows\n" +
  "    return result\n"

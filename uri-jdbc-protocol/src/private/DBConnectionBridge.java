import java.nio.charset.Charset;
import java.sql.*;
import java.time.Instant;
import java.util.*;

public class DBConnectionBridge implements AutoCloseable {
    private Connection db;
    private boolean rowKey;
    private LinkedList<Savepoint> savePoints = new LinkedList<>();

    public static class DBResult {
        public DBColumnInfo[] columns;
        public Object[][]     records;
        public Integer        rowCount;
        public String         rowKey;
    }

    private static String notEmpty(String value) {
        return value != null && !value.isEmpty() ? value : null;
    }

    public static class DBColumnInfo {
        private DBColumnInfo(ResultSetMetaData rsmd, int column) throws SQLException {
            label         = rsmd.getColumnLabel(column);
            type_id       = rsmd.getColumnType(column);

            table_catalog = notEmpty(rsmd.getCatalogName(column));
            table_schema  = notEmpty(rsmd.getSchemaName(column));
            table_name    = notEmpty(rsmd.getTableName(column));
            column_name   = table_name != null ? notEmpty(rsmd.getColumnName(column)) : null;
        }

        public String  label;
        public Integer type_id;

        public String  table_catalog;
        public String  table_schema;
        public String  table_name;
        public String  column_name;

        public Integer ordinal_position;
        public Object  column_default;
        public Boolean is_nullable;
        public String  data_type;
        public Integer character_maximum_length;
        public Integer character_octet_length;
        public Integer numeric_precision;
        public Integer numeric_precision_radix;
        public Integer numeric_scale;
        public Integer datetime_precision;
        public String  interval_type;
        public Integer interval_precision;
        public String  character_set_catalog;
        public String  character_set_schema;
        public String  character_set_name;
        public String  collation_catalog;
        public String  collation_schema;
        public String  collation_name;
        public String  domain_catalog;
        public String  domain_schema;
        public String  domain_name;
        public String  udt_catalog;
        public String  udt_schema;
        public String  udt_name;
        public String  scope_catalog;
        public String  scope_schema;
        public String  scope_name;
        public Integer maximum_cardinality;
        public String  dtd_identifier;
        public Boolean is_self_referencing;
        public Boolean is_identity;
        public String  identity_generation;
        public String  identity_start;
        public String  identity_increment;
        public String  identity_maximum;
        public String  identity_minimum;
        public Boolean identity_cycle;
        public Boolean is_generated;
        public String  generation_expression;
        public Boolean is_updatable;
        public Boolean is_hidden;
        public String  crdb_sql_type;
        public String  column_type;
        public String  column_key;
        public String  extra;
        public String  privileges;
        public String  column_comment;
    }

    public DBConnectionBridge(String url, Properties info) throws SQLException {
        db = DriverManager.getConnection(url, info);
        rowKey = db.getMetaData().supportsGetGeneratedKeys();
    }

    public void close() throws SQLException {
        db.close();
    }

    public DBResult query(String query, Object[] params) throws SQLException {
        try (PreparedStatement ps = db.prepareStatement(query, rowKey ? Statement.RETURN_GENERATED_KEYS : Statement.NO_GENERATED_KEYS)) {
            for (int i = 0; i < params.length; ++i) {
                ps.setObject(i + 1, fromBridgeType(params[i]));
            }

            DBResult result = new DBResult();

            if (ps.execute()) {
                try (ResultSet rs = ps.getResultSet()) {
                    ResultSetMetaData rsmd = rs.getMetaData();
                    DBColumnInfo[] columns = result.columns = new DBColumnInfo[rsmd.getColumnCount()];

                    for (int c = 1; c <= columns.length; ++c) {
                        columns[c - 1] = new DBColumnInfo(rsmd, c);
                    }

                    ArrayList<Object[]> records = new ArrayList<>();

                    while (rs.next()) {
                        Object[] row = new Object[columns.length];

                        for (int i = 0; i < columns.length; ++i) {
                            row[i] = toBrideType(rs, rsmd, i + 1);
                        }

                        records.add(row);
                    }

                    result.records = records.toArray(new Object[records.size()][]);
                }
            }

            result.rowCount = ps.getUpdateCount() >= 0 ? ps.getUpdateCount() : null;
            result.rowKey   = getRowKey(ps);

            if (ps.getMoreResults()) {
                throw new RuntimeException("Only one result set per query supported");
            }

            return result;
        }
    }

    public boolean begin(int isolationLevel) throws SQLException {
        boolean first = db.getAutoCommit();

        if (first) {
            db.setAutoCommit(false);

            if (isolationLevel > 0) {
                db.setTransactionIsolation(isolationLevel);
            }
        }
        else {
            savePoints.push(db.setSavepoint());
        }

        return first;
    }

    public void rollback() throws SQLException {
        Savepoint sp = savePoints.poll();

        if (sp != null) {
            db.rollback(sp);
        }
        else {
            try {
                db.rollback();
            }
            finally {
                db.setAutoCommit(true);
            }
        }
    }

    public void commit() throws SQLException {
        Savepoint sp = savePoints.poll();

        if (sp != null) {
            db.releaseSavepoint(sp);
        }
        else {
            try {
                db.commit();
            }
            finally {
                db.setAutoCommit(true);
            }
        }
    }

    private String getRowKey(PreparedStatement ps) {
        if (rowKey) {
            try (ResultSet rs = ps.getGeneratedKeys()) {
                if (rs.next()) {
                    return rs.getString(1);
                }
            }
            catch (Exception ex) {
                ex.printStackTrace();
            }
        }

        return null;
    }

    private Object fromBridgeType(Object _value) {
        Object[] value = (Object[]) _value;
        String type = (String) value[0];

        switch (type) {
            case "=": return value[1];
            case "L": return Long.valueOf((String) value[1]);
            case "D": return Instant.parse(((String) value[1]));
            case "B": return ((String) value[1]).getBytes(latin1);
            case "J": return ((String) value[1]).getBytes(utf8);
            case "A": {
                Object[] values = (Object[]) value[1];
                Object[] result = new Object[values.length];

                for (int i = 0; i < values.length; ++i) {
                    result[i] = fromBridgeType(values[i]);
                }

                return result;
            }

            default:
                throw new IllegalArgumentException("Invalid bridge type: " + type);
        }
    }

    private Object[] toBrideType(ResultSet rs, ResultSetMetaData rsmd, int column) throws SQLException {
        int id = rsmd.getColumnType(column);
        String tname = rsmd.getColumnTypeName(column).toLowerCase(Locale.ROOT);
        Object value =
            id == Types.ARRAY ? rs.getObject(column, java.sql.Array.class) :
            id == Types.TIMESTAMP || id == Types.TIMESTAMP_WITH_TIMEZONE ? rs.getObject(column, Instant.class) :
            id == Types.DATE || id == Types.DECIMAL || id == Types.SQLXML || id == Types.TIME || id == Types.TIME_WITH_TIMEZONE ? rs.getObject(column, String.class) :
            rs.getObject(column);

        if (value instanceof Array) {
            Array  sqlArray = (Array) value;
            Object elements = sqlArray.getArray();
            int elementType = sqlArray.getBaseType();
            String typeName = sqlArray.getBaseTypeName();
            Object[] result = new Object[java.lang.reflect.Array.getLength(elements)];

            for (int i = 0; i < result.length; ++i) {
                result[i] = toBrideType(java.lang.reflect.Array.get(elements, i), elementType, typeName);
            }

            return new Object[] { "A", result };
        }
        else {
            return toBrideType(value, id, tname);
        }
    }

    private Object[] toBrideType(Object value, int id, String tname) {
        if (tname.startsWith("json")) {
            if (value instanceof byte[]) {
                return new Object[] { "J", new String((byte[]) value, utf8) };
            }
            else if (value != null) {
                return new Object[] { "J", value.toString() };
            }
        }

        if (value == null || value instanceof Integer || value instanceof Float || value instanceof Double || value instanceof Boolean || value instanceof String) {
            return new Object[] { "=", value };
        }
        else if (value instanceof Long) {
            return new Object[] { "L", value.toString() };
        }
        else if (value instanceof Instant) {
            return new Object[] { "D", value.toString() };
        }
        else if (value instanceof byte[]) {
            return new Object[] { "B", new String((byte[]) value, latin1) };
        }
        else {
            return new Object[] { "=", value.toString() };
        }
    }

    private static Charset utf8 = Charset.forName("utf8");
    private static Charset latin1 = Charset.forName("latin1");
}

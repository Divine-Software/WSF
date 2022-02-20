// From <https://github.com/microsoft/mssql-jdbc/blob/09d35bfc/src/main/java/com/microsoft/sqlserver/jdbc/SQLServerException.java#L355>
/** @ignore */
export const enum SQLServerSQLState {
    STRING_DATA_RIGHT_TRUNCATION   = "22001",
    INTEGRITY_CONSTRAINT_VIOLATION = "23000",
    SERIALIZATION_FAILURE          = "40001",
    DUPLICATE_TABLE                = "S0001",
    UNDEFINED_TABLE                = "S0002",
}

export function databaseErrorResponse() {
  return {
    code: "database_error" as const,
    error: "Database request failed.",
    status: "error" as const,
  };
}

export function internalErrorResponse() {
  return {
    code: "internal_error" as const,
    error: "Internal server error.",
    status: "error" as const,
  };
}

export const internalError = (error: unknown) => {
  console.error("unhandled worker error", error);
  return Response.json(
    { error: "Internal error", success: false },
    { status: 500 }
  );
};

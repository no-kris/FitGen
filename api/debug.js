export const config = {
  runtime: "edge",
};

export default async function handler() {
  return new Response(
    JSON.stringify({
      MODEL: process.env.MODEL,
      MODEL_FALLBACK_1: process.env.MODEL_FALLBACK_1,
      MODEL_FALLBACK_2: process.env.MODEL_FALLBACK_2,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export function ok(data, meta = undefined) {
  return meta === undefined ? { success: true, data } : { success: true, data, meta };
}

export function created(data) {
  return { success: true, data };
}
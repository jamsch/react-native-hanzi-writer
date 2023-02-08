export function generateId() {
  // Simple equivalent to shortid.generate()
  return Math.random().toString(36).substring(2, 9);
}

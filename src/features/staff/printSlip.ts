// FILE: src/features/staff/printSlip.ts

/** Prints the slip alone: hides every other body child for the print only. */
export function printSlip() {
  document.body.classList.add("printing-slip");
  const done = () => { document.body.classList.remove("printing-slip"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

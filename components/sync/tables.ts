/**
 * On a phone every .table becomes a stack of cards (styles.css), each cell
 * showing its column's name beside the value. The names come from the
 * table's own header, copied onto the cells whenever a table renders, so no
 * screen has to repeat them.
 */
export function labelTables(): void {
  const label = (root: ParentNode) => {
    root.querySelectorAll<HTMLTableElement>('table.table').forEach((t) => {
      const heads = Array.from(t.tHead?.rows[0]?.cells ?? []).map((th) => th.textContent?.trim() ?? '');
      Array.from(t.tBodies).forEach((b) =>
        Array.from(b.rows).forEach((r) =>
          Array.from(r.cells).forEach((td, i) => {
            const want = heads[i] ?? '';
            if (td.dataset.label !== want) td.dataset.label = want;
          }),
        ),
      );
    });
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      label(document);
    });
  }).observe(document.body, { childList: true, subtree: true });
}

export function snapshotBlockContext(store) {
  return {
    zone: store.currentZone.name,
    id_lang: store.psContext.id_lang,
    id_shop: store.psContext.id_shop,
  };
}

export function sameBlockContext(left, right) {
  return Boolean(left && right && left.zone === right.zone
    && String(left.id_lang) === String(right.id_lang)
    && String(left.id_shop) === String(right.id_shop));
}

export function acceptsBlockRefresh(requestId, latestRequestId, requested, current) {
  return requestId === latestRequestId && sameBlockContext(requested, current);
}

export function emptyBlockSelection() {
  return {
    id_prettyblocks: null,
    instance_id: null,
    code: null,
    subSelected: null,
    need_reload: true,
    states: [],
  };
}

// Ordinary refreshes preserve the complete selection, including repeater state.
// Only add/delete operations explicitly request a new selection.
export function blockSelectionAfterRefresh(blocks, current, options = {}) {
  let selected;
  if (options.selectId != null) {
    selected = blocks.find(block => String(block.id_prettyblocks) === String(options.selectId));
  } else if (options.afterDelete) {
    selected = blocks[blocks.length - 1];
  }
  if (selected) {
    return {
      currentBlock: {
        id_prettyblocks: selected.id_prettyblocks,
        instance_id: selected.instance_id,
        code: selected.code,
        subSelected: null,
        need_reload: selected.need_reload == null ? true : selected.need_reload,
        states: selected.repeater_db || [],
      },
      saveContext: 'config',
    };
  }
  if (!blocks.length || options.contextChanged
    || (current.id_prettyblocks != null && !blocks.some(block => String(block.id_prettyblocks) === String(current.id_prettyblocks)))) {
    return { currentBlock: emptyBlockSelection(), saveContext: 'settings' };
  }
  return null;
}

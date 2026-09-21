(() => {
  const parts = [
    ['Main square', 'Structure', 'main square.stl'], ['Connector', 'Connector', 'connector.stl'],
    ['90 degree vertical', 'Angle', '90 vertical.stl'], ['90 degree vertical rounded', 'Angle', '90 vertical rounded.stl'],
    ['90 degree horizontal', 'Angle', '90 horizontal.stl'], ['90 degree horizontal rounded', 'Angle', '90 horizontal rounded.stl'],
    ['180 degree vertical', 'Angle', '180 vertical.stl'], ['180 degree horizontal', 'Angle', '180 horizontal.stl'],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(number => [`Ring ${number}-8`, 'Ring', `ring ${number}-8.stl`])
  ].map(([name, category, file]) => ({ name, category, file, group: ['Structure', 'Angle'].includes(category) ? 'Structural' : 'Connections', url: `./3D%20parts/${encodeURIComponent(file)}` }));

  window.SKADIS_PARTS = parts;
  const state = { filter: 'All', query: '', corners: 'Sharp' };
  const list = document.querySelector('#parts-list');
  const filters = document.querySelector('#filters');
  const search = document.querySelector('#part-search');
  const template = document.querySelector('#part-template');
  const dropZone = document.querySelector('#drop-zone');
  const emptyDragImage = new Image();
  emptyDragImage.alt = '';
  emptyDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  emptyDragImage.className = 'empty-drag-image';
  document.body.append(emptyDragImage);
  let activeDragPart = null;

  function createPartItem(part, rotation = 0, label = part.name) {
      const choice = { ...part, initialRotation: rotation };
      const item = template.content.firstElementChild.cloneNode(true);
      item.dataset.category = part.category;
      item.dataset.file = part.file;
      item.dataset.name = label;
      item.setAttribute('aria-label', label);
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.querySelector('.part-preview').style.transform = `rotate(${rotation}rad)`;
      if (part.previewUrl) {
        const image = new Image();
        image.alt = `${part.name} 3D preview`;
        image.draggable = false;
        image.src = part.previewUrl;
        item.querySelector('.part-preview').replaceChildren(image);
      }
      item.addEventListener('dragstart', event => {
        activeDragPart = choice;
        event.dataTransfer.setData('text/plain', part.file);
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setDragImage(emptyDragImage, 0, 0);
        item.classList.add('dragging');
        document.dispatchEvent(new CustomEvent('skadis:menu-drag-start', { detail: { part: choice } }));
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.dispatchEvent(new CustomEvent('skadis:menu-drag-end'));
        activeDragPart = null;
      });
      item.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('skadis:add-part', { detail: choice }));
      });
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
      return item;
  }

  function createSection(title) {
    const section = document.createElement('section');
    section.className = 'part-group';
    const heading = document.createElement('h2');
    heading.className = 'part-group-title';
    heading.textContent = title;
    section.append(heading);
    return section;
  }

  function matches(part, label = '') {
    return `${part.name} ${label}`.toLowerCase().includes(state.query);
  }

  function createPanelPalette() {
    const section = createSection('Panels');
    const cornerSwitch = document.createElement('div');
    cornerSwitch.className = 'corner-switch';
    cornerSwitch.setAttribute('role', 'group');
    cornerSwitch.setAttribute('aria-label', 'Corner style');
    ['Sharp', 'Rounded'].forEach(style => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `corner-option ${state.corners === style ? 'active' : ''}`;
      button.setAttribute('aria-pressed', String(state.corners === style));
      const icon = document.createElement('i');
      icon.className = `corner-symbol ${style.toLowerCase()}`;
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon, document.createTextNode(style));
      button.onclick = () => { state.corners = style; renderCatalog(); };
      cornerSwitch.append(button);
    });
    section.append(cornerSwitch);
    const rounded = state.corners === 'Rounded' ? ' rounded' : '';
    // Rows mirror a board: corners, edges and the full panel at its center.
    const slots = [
      [`90 vertical${rounded}.stl`, 0, 'Top left corner'],
      ['180 horizontal.stl', Math.PI, 'Top edge'],
      [`90 horizontal${rounded}.stl`, Math.PI, 'Top right corner'],
      ['180 vertical.stl', 0, 'Left edge'],
      ['main square.stl', 0, 'Full panel'],
      ['180 vertical.stl', Math.PI, 'Right edge'],
      [`90 horizontal${rounded}.stl`, 0, 'Bottom left corner'],
      ['180 horizontal.stl', 0, 'Bottom edge'],
      [`90 vertical${rounded}.stl`, Math.PI, 'Bottom right corner']
    ];
    const grid = document.createElement('div');
    grid.className = 'part-grid panel-map';
    grid.setAttribute('aria-label', 'Panel positions');
    let matchCount = 0;
    slots.forEach(([file, rotation, position]) => {
      const part = parts.find(part => part.file === file);
      if (matches(part, position)) {
        const label = `${position} · ${part.category === 'Angle' && file.startsWith('90') ? state.corners + ' · ' : ''}${part.name}`;
        const item = createPartItem(part, rotation, label);
        if (file === 'main square.stl') item.classList.add('full-panel');
        grid.append(item);
        matchCount++;
      } else {
        const empty = document.createElement('div');
        empty.className = 'palette-empty-slot';
        empty.setAttribute('aria-hidden', 'true');
        grid.append(empty);
      }
    });
    section.append(grid);
    return matchCount ? section : null;
  }

  function renderCatalog() {
    window.SKADIS_CORNER_STYLE = state.corners;
    const categories = ['All', 'Panels', 'Connections'];
    filters.replaceChildren(...categories.map(category => {
      const button = document.createElement('button');
      button.className = `filter ${state.filter === category ? 'active' : ''}`;
      button.textContent = category;
      button.setAttribute('aria-pressed', String(state.filter === category));
      button.onclick = () => { state.filter = category; renderCatalog(); };
      return button;
    }));
    const groups = [];
    if (state.filter !== 'Connections') {
      const panels = createPanelPalette();
      if (panels) groups.push(panels);
    }
    if (state.filter !== 'Panels') {
      const connections = parts.filter(part => part.group === 'Connections' && matches(part));
      if (connections.length) {
        const section = createSection('Connections');
        ['Connector', 'Ring'].forEach(category => {
          const categoryParts = connections.filter(part => part.category === category);
          if (!categoryParts.length) return;
          const heading = document.createElement('h3');
          heading.className = 'part-subheading';
          heading.textContent = category === 'Ring' ? 'Rings · 1/8 to 8/8' : 'Connector';
          const grid = document.createElement('div');
          grid.className = 'part-grid';
          grid.replaceChildren(...categoryParts.map(part => createPartItem(part)));
          section.append(heading, grid);
        });
        groups.push(section);
      }
    }
    list.replaceChildren(...groups);
    if (!groups.length) {
      const empty = document.createElement('p');
      empty.className = 'catalog-empty';
      empty.textContent = 'No matching parts.';
      list.append(empty);
    }
  }

  search.addEventListener('input', event => {
    state.query = event.target.value.toLowerCase();
    renderCatalog();
  });
  dropZone.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    document.dispatchEvent(new CustomEvent('skadis:menu-drag-move', {
      detail: { clientX: event.clientX, clientY: event.clientY }
    }));
  });
  dropZone.addEventListener('drop', event => {
    event.preventDefault();
    const part = activeDragPart || parts.find(item => item.file === event.dataTransfer.getData('text/plain'));
    if (!part) return;
    document.dispatchEvent(new CustomEvent('skadis:menu-drag-drop', {
      detail: { part, clientX: event.clientX, clientY: event.clientY }
    }));
  });
  renderCatalog();
})();

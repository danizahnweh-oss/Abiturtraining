/* Teacher-only draft revisions. No proposal is saved or applied automatically. */
(() => {
  const el = id => document.getElementById(id);
  if (!el('revisionGenerate')) return;
  let sequence = 0, proposal = null, snapshot = null, undo = null, applied = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const status = text => { el('revisionStatus').textContent = text; };
  const current = () => { syncTaskEdits(); return clone(pendingTaskData); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const busy = value => {
    el('revisionGenerate').disabled = value;
    el('revisionGenerate').textContent = value ? 'Vorschlag wird erstellt …' : 'Vorschlag erstellen';
    el('revisionInstructions').disabled = value;
    el('revisionGenerate').closest('section').setAttribute('aria-busy', String(value));
  };
  function reset() {
    sequence++;
    proposal = snapshot = undo = applied = null;
    el('revisionProposal').hidden = true;
    el('revisionUndo').hidden = true;
    el('revisionChanges').replaceChildren();
    el('revisionInstructions').value = '';
    status(''); busy(false);
  }
  window.taskRevision = { reset };
  document.querySelectorAll('[data-revision-preset]').forEach(button => button.addEventListener('click', () => {
    if (el('revisionInstructions').disabled) return;
    el('revisionInstructions').value = button.dataset.revisionPreset;
    el('revisionInstructions').focus();
  }));
  const labels = { teilaufgaben: 'Teilaufgabe', aufgabenbloecke: 'Aufgabenblock', task_instruction: 'Aufgabenstellung', task_instruction_a: 'Teil A', task_instruction_b: 'Teil B', aufgabe: 'Aufgabentext', primary_text: 'Quellentext', materialien: 'Material', material: 'Material', text: 'Text', inhalt: 'Inhalt', content: 'Inhalt', rubric_prompt: 'Erwartungshorizont' };
  const label = path => path.map(part => typeof part === 'number' ? String(part + 1) : labels[part] || part).join(' · ');
  function render(edits) {
    const container = el('revisionChanges');
    container.replaceChildren();
    edits.forEach(edit => {
      const row = document.createElement('section'); row.className = 'revision-change';
      const title = document.createElement('h4'); title.textContent = label(edit.path); row.append(title);
      const reason = document.createElement('p'); reason.textContent = edit.reason; row.append(reason);
      const columns = document.createElement('div'); columns.className = 'revision-comparison';
      [['Bisher', edit.before], ['Vorschlag', edit.text]].forEach(([heading, text]) => {
        const column = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = heading;
        const content = document.createElement('pre'); content.textContent = text;
        column.append(strong, content); columns.append(column);
      });
      row.append(columns); container.append(row);
    });
    el('revisionProposal').hidden = false;
    el('revisionResultHeading').focus();
  }
  el('revisionGenerate').addEventListener('click', async () => {
    const instructions = el('revisionInstructions').value.trim();
    if (instructions.length < 5) { status('Bitte beschreibe deinen Änderungswunsch mit mindestens fünf Zeichen.'); el('revisionInstructions').focus(); return; }
    const draft = current();
    if (!draft) { status('Bitte zuerst eine Aufgabe öffnen.'); return; }
    const ticket = ++sequence;
    proposal = null; el('revisionProposal').hidden = true; busy(true);
    status('Die KI überarbeitet die Texte und prüft anschließend Thema und Anforderungen. Deine Aufgabe bleibt bis zur Übernahme unverändert.');
    try {
      // Images are preserved in the local snapshot, never sent as text to the model.
      const payload = JSON.parse(JSON.stringify(draft, (key, value) =>
        /^(?:image_url|image_base64|audio_url|_)/.test(key) || (typeof value === 'string' && value.startsWith('data:')) ? undefined : value));
      const result = await teacherApi('/api/generate-teacher-revision', { task_data: payload, instructions, subject: pendingTaskSubject, subject_group: pendingTaskSubjectGroup });
      if (ticket !== sequence) return;
      if (!Array.isArray(result.edits)) throw new Error('Kein gültiger Vorschlag empfangen. Bitte erneut versuchen.');
      if (!result.edits.length) { status(result.message || 'Keine passenden Änderungen gefunden. Bitte präzisiere deinen Wunsch.'); return; }
      proposal = result.edits; snapshot = draft;
      render(proposal); status('Vorschlag bereit. Prüfe die Änderungen, bevor du sie übernimmst.');
    } catch (error) { if (ticket === sequence) status(error.message || 'Der Vorschlag konnte nicht erstellt werden. Bitte erneut versuchen.'); }
    finally { if (ticket === sequence) busy(false); }
  });
  el('revisionApply').addEventListener('click', () => {
    if (!proposal || !same(current(), snapshot)) { status('Die Aufgabe wurde inzwischen bearbeitet. Erstelle einen neuen Vorschlag für den aktuellen Stand.'); return; }
    const next = clone(snapshot);
    try {
      for (const edit of proposal) {
        if (!Array.isArray(edit.path) || !edit.path.length || edit.path.some(key => ['__proto__','constructor','prototype'].includes(key))) throw new Error('Ungültiger Vorschlag.');
        let target = next;
        for (const key of edit.path.slice(0, -1)) {
          if (!Object.prototype.hasOwnProperty.call(target, key)) throw new Error('Ungültiges Feld.');
          target = target[key];
        }
        const key = edit.path.at(-1);
        if (!Object.prototype.hasOwnProperty.call(target, key) || target[key] !== edit.before || typeof edit.text !== 'string') throw new Error('Der Vorschlag passt nicht mehr zur Aufgabe.');
        target[key] = edit.text;
      }
      const previous = clone(snapshot);
      const title = el('taskTitleInput').value;
      pendingTaskData = next; showTaskPreview(); el('taskTitleInput').value = title;
      undo = previous; applied = clone(next); el('revisionUndo').hidden = false;
      status('Vorschlag übernommen. Speichere die Aufgabe, wenn alle Änderungen passen.'); el('revisionUndo').focus();
    } catch (error) { status(error.message); }
  });
  el('revisionDiscard').addEventListener('click', () => {
    proposal = snapshot = null; el('revisionProposal').hidden = true;
    status('Vorschlag verworfen. Deine Aufgabe ist unverändert.'); el('revisionGenerate').focus();
  });
  el('revisionUndo').addEventListener('click', () => {
    if (!undo || !same(current(), applied)) { status('Nach der Übernahme wurde weiterbearbeitet. Rückgängig würde diese Änderungen überschreiben und wurde deshalb nicht ausgeführt.'); return; }
    const title = el('taskTitleInput').value;
    pendingTaskData = clone(undo); showTaskPreview(); el('taskTitleInput').value = title;
    status('Letzte KI-Übernahme rückgängig gemacht.'); el('revisionGenerate').focus();
  });
})();

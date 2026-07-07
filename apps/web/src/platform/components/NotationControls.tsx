/**
 * Notation picker: built-in + user-registered notations as a Segmented, plus
 * an inline "+ custom" form that registers a 12-note mapping table.
 */
import { useState } from 'react';
import { Button, Segmented } from '@laude/design-system';
import { SHARP_NAMES, listNotations, registerNotation, validateNotationDef } from '@laude/chords';
import { useT } from '@laude/i18n/react';

const CUSTOM_OPTION = '__custom__';

export function NotationControls(props: { value: string; onChange: (notationId: string) => void }) {
  const t = useT();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState<string[]>([...SHARP_NAMES]);
  const [errors, setErrors] = useState<string[]>([]);

  const options = [
    ...listNotations().map((n) => ({ id: n.id, label: n.label })),
    { id: CUSTOM_OPTION, label: t('notation.custom') },
  ];

  const closeForm = () => {
    setFormOpen(false);
    setErrors([]);
  };

  const submit = () => {
    const label = name.trim();
    const def = {
      id: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      sharp: notes.map((n) => n.trim()),
    };
    const found = validateNotationDef(def).map((e) => e.message);
    if (label === '') found.unshift(t('notation.name'));
    if (found.length > 0) {
      setErrors(found);
      return;
    }
    try {
      registerNotation(def);
    } catch (err) {
      setErrors([String(err)]);
      return;
    }
    closeForm();
    props.onChange(def.id);
  };

  return (
    <div className="ld-vstack">
      <Segmented
        options={options}
        value={formOpen ? CUSTOM_OPTION : props.value}
        onChange={(id) => {
          if (id === CUSTOM_OPTION) {
            setFormOpen(true);
          } else {
            closeForm();
            props.onChange(id);
          }
        }}
      />
      {formOpen && (
        <div className="ld-card ld-vstack">
          <span className="ld-label">{t('notation.customTitle')}</span>
          <input
            className="ld-input"
            placeholder={t('notation.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="ld-label">{t('notation.sharpNames')}</span>
          <div className="ld-hstack">
            {notes.map((note, i) => (
              <input
                key={i}
                className="ld-input"
                style={{ width: '56px' }}
                value={note}
                onChange={(e) => setNotes(notes.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          </div>
          {errors.length > 0 && (
            <div className="ld-vstack">
              <span className="ld-chip ld-chip--warn">{t('notation.invalid')}</span>
              {errors.map((message, i) => (
                <span key={i} className="ld-label">
                  {message}
                </span>
              ))}
            </div>
          )}
          <div className="ld-hstack">
            <Button variant="primary" onClick={submit}>
              {t('notation.register')}
            </Button>
            <Button variant="ghost" onClick={closeForm}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { parseClockTime, minutesToHHMM } from '../lib/time';
import './TimeScrollPicker.css';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const SIXTY = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// One box (hour, minute, second). Click opens a sideways strip underneath,
// tap a value to pick it. Outside click / Esc closes.
export function ScrollPickerBox({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const stripRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // normal mouse wheel scrolls the strip sideways
    function handleWheel(e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        stripRef.current.scrollLeft += e.deltaY;
      }
    }

    const strip = stripRef.current;
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    if (strip) strip.addEventListener('wheel', handleWheel, { passive: false });

    // selected value in the middle when it opens
    const selected = strip && strip.querySelector('.is-selected');
    if (selected) {
      strip.style.scrollBehavior = 'auto';
      strip.scrollLeft = selected.offsetLeft - strip.clientWidth / 2 + selected.clientWidth / 2;
      strip.style.scrollBehavior = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
      if (strip) strip.removeEventListener('wheel', handleWheel);
    };
  }, [open]);

  function nudge(direction) {
    if (stripRef.current) stripRef.current.scrollBy({ left: direction * 160, behavior: 'smooth' });
  }

  return (
    <div className="scroll-picker" ref={wrapRef}>
      <button
        type="button"
        className={`scroll-picker-box ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        aria-label={label}
        aria-expanded={open}>
        {value === '' ? '--' : value}
      </button>
      {open && (
        <div className="scroll-picker-panel">
          <button type="button" className="scroll-picker-arrow" onClick={() => nudge(-1)} aria-label="Scroll left">‹</button>
          <div className="scroll-picker-strip" ref={stripRef}>
            {options.map(option => (
              <button
                type="button"
                key={option}
                className={`scroll-picker-option ${option === value ? 'is-selected' : ''}`}
                onClick={() => { onChange(option); setOpen(false); }}>
                {option}
              </button>
            ))}
          </div>
          <button type="button" className="scroll-picker-arrow" onClick={() => nudge(1)} aria-label="Scroll right">›</button>
        </div>
      )}
    </div>
  );
}

// Clock time: hour : minute + AM/PM toggle. value is "HH:MM" (24h) or ''.
export function ClockTimePicker({ value, onChange }) {
  const minutes = parseClockTime(value);
  const h24 = minutes === null ? null : Math.floor(minutes / 60);
  const hour12 = h24 === null ? '' : String(h24 % 12 === 0 ? 12 : h24 % 12);
  const minute = minutes === null ? '' : String(minutes % 60).padStart(2, '0');
  const period = h24 === null ? 'AM' : (h24 < 12 ? 'AM' : 'PM');

  // missing hour/minute (old unreadable times) fill in as 12 / 00
  function update(next) {
    const h = Number((next.hour12 ?? hour12) || 12);
    const m = Number((next.minute ?? minute) || 0);
    const p = next.period ?? period;
    onChange(minutesToHHMM(((h % 12) + (p === 'PM' ? 12 : 0)) * 60 + m));
  }

  return (
    <div className="time-picker-row">
      <ScrollPickerBox value={hour12} options={HOURS_12} label="Hour" onChange={v => update({ hour12: v })} />
      <span className="time-picker-sep">:</span>
      <ScrollPickerBox value={minute} options={SIXTY} label="Minute" onChange={v => update({ minute: v })} />
      <button
        type="button"
        className="scroll-picker-box time-picker-period"
        onClick={() => update({ period: period === 'AM' ? 'PM' : 'AM' })}
        aria-label="Switch AM / PM">
        {period}
      </button>
    </div>
  );
}

// Duration: hours : minutes : seconds. value is "HH:MM:SS" (anything unreadable counts as 0).
export function DurationPicker({ value, onChange }) {
  const parts = String(value || '').split(':').map(n => Number(n));
  const valid = parts.length === 3 && parts.every(n => Number.isFinite(n) && n >= 0);
  const [h, m, s] = valid ? parts : [0, 0, 0];
  const hh = String(Math.min(h, 23)).padStart(2, '0');
  const mm = String(Math.min(m, 59)).padStart(2, '0');
  const ss = String(Math.min(s, 59)).padStart(2, '0');

  function update(next) {
    onChange(`${next.hh ?? hh}:${next.mm ?? mm}:${next.ss ?? ss}`);
  }

  return (
    <div className="time-picker-row">
      <ScrollPickerBox value={hh} options={HOURS_24} label="Hours" onChange={v => update({ hh: v })} />
      <span className="time-picker-sep">:</span>
      <ScrollPickerBox value={mm} options={SIXTY} label="Minutes" onChange={v => update({ mm: v })} />
      <span className="time-picker-sep">:</span>
      <ScrollPickerBox value={ss} options={SIXTY} label="Seconds" onChange={v => update({ ss: v })} />
    </div>
  );
}

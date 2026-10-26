import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodsEditor } from './PeriodsEditor';
import { PERIOD_PALETTE } from './periodsModel';
import type { TrackPeriod } from './trackRenderModel';

const range = { from: '2026-01-01', to: '2026-10-26' };
let latest: TrackPeriod[] = [];
function Host({ initial = [] as TrackPeriod[] }) {
  const [p, setP] = useState<TrackPeriod[]>(initial);
  latest = p;
  return <PeriodsEditor periods={p} range={range} onChange={setP} />;
}

describe('PeriodsEditor (every control is clickable and changes state)', () => {
  it('Add period → rows with distinct colours, dates editable, remove works', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.getByText(/No periods yet/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '+ Add period' }));
    await user.click(screen.getByRole('button', { name: '+ Add period' }));
    await user.click(screen.getByRole('button', { name: '+ Add period' }));
    expect(latest).toHaveLength(3);
    expect(new Set(latest.map(p => p.color)).size).toBe(3);
    expect(latest[0].color).toBe(PERIOD_PALETTE[0]);

    // edit dates + colour of period 1
    fireEvent.change(screen.getByLabelText('Period 1 from'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Period 1 to'), { target: { value: '2026-04-30' } });
    fireEvent.change(screen.getByLabelText('Period 1 colour'), { target: { value: '#112233' } });
    fireEvent.change(screen.getByLabelText('Period 1 label'), { target: { value: 'Winter' } });
    expect(latest[0]).toMatchObject({ from: '2026-02-01', to: '2026-04-30', color: '#112233', label: 'Winter' });

    await user.click(screen.getByRole('button', { name: 'Remove period 2' }));
    expect(latest).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(latest).toHaveLength(0);
  });

  it('Example fills two contiguous periods', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Example' }));
    expect(latest).toHaveLength(2);
    expect(latest[0].from).toBe(range.from); expect(latest[1].to).toBe(range.to);
  });

  it('shows an error for an inverted range and a warning for overlap', () => {
    render(<Host initial={[
      { id: 'a', from: '2026-05-01', to: '2026-04-01', color: '#111111' },
      { id: 'b', from: '2026-01-01', to: '2026-06-30', color: '#222222' },
      { id: 'c', from: '2026-06-01', to: '2026-08-01', color: '#333333' },
    ]} />);
    expect(within(screen.getByTestId('period-0')).getByRole('alert').textContent).toMatch(/after/);
    expect(within(screen.getByTestId('period-2')).getByText(/Overlaps period 2/)).toBeTruthy();
  });
});

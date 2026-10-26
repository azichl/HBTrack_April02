import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LegendBlock } from './LegendBlock';
import { LegendEditorPanel } from './LegendEditorPanel';
import { createLegendStore } from './legendStore';

const presence = { distCamp: false, mainRoad: false, towns: false };

function setup(extra?: Parameters<typeof LegendBlock>[0]['extra']) {
  const saved: unknown[] = [];
  const store = createLegendStore(undefined, s => saved.push(s));
  render(<><LegendEditorPanel store={store} presence={presence} extra={extra} /><LegendBlock store={store} presence={presence} extra={extra} /></>);
  return { store, saved, legend: () => screen.getByTestId('map-legend') };
}

describe('Legend editor ↔ map legend stay in sync', () => {
  it('typing in the editor changes the printed legend immediately', async () => {
    const user = userEvent.setup();
    const { legend, saved } = setup();
    expect(within(legend()).getByText('Release Location')).toBeTruthy();
    const input = screen.getByLabelText('Release Location text');
    await user.clear(input); await user.type(input, 'Release Loc');
    expect(within(legend()).getByText('Release Loc')).toBeTruthy();
    expect(within(legend()).queryByText('Release Location')).toBeNull();
    expect(saved.length).toBeGreaterThan(0);                       // autosave hook fired
  });
  it('clearing the text prints the default label (never an empty line)', async () => {
    const user = userEvent.setup();
    const { legend } = setup();
    await user.clear(screen.getByLabelText('Latest Location text'));
    expect(within(legend()).getByText('Latest Location')).toBeTruthy();
  });
  it('eye, colour, shape, reorder, reset, custom items all reach the map legend', async () => {
    const user = userEvent.setup();
    const { legend } = setup();
    await user.click(screen.getByLabelText('Show Camp'));
    expect(within(legend()).queryByText('Camp')).toBeNull();
    await user.click(screen.getByLabelText('Show Camp'));
    expect(within(legend()).getByText('Camp')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Flight Track colour'), { target: { value: '#ff0000' } });
    expect(legend().querySelector('[data-id="track"] path')!.getAttribute('stroke')).toBe('#ff0000');

    fireEvent.change(screen.getByLabelText('Flight Track shape'), { target: { value: 'dashed' } });
    expect(legend().querySelector('[data-id="track"] path')!.getAttribute('stroke-dasharray')).toBe('3 2');

    await user.click(screen.getByLabelText('Move Flight Track up'));
    const order = [...legend().querySelectorAll('[data-id]')].map(n => n.getAttribute('data-id'));
    expect(order.indexOf('track')).toBeLessThan(order.indexOf('distRelease'));

    await user.click(screen.getByRole('button', { name: 'Reset Flight Track' }));
    expect(legend().querySelector('[data-id="track"] path')!.getAttribute('stroke')).toBe('#6366f1');

    await user.click(screen.getByRole('button', { name: '+ Add item' }));
    expect(within(legend()).getByText('New item')).toBeTruthy();
  });
  it('items not on this map are listed with a badge but not printed; counts are consistent', () => {
    const { legend } = setup();
    expect(within(screen.getByTestId('legend-row-distCamp')).getByText('not on map')).toBeTruthy();
    expect(within(legend()).queryByText('Distance to Camp')).toBeNull();
    expect(screen.getByTestId('legend-count').textContent).toBe('5 / 8 shown');
  });
  it('presentation: 1 line / 1 / 2 / 3 columns change the printed layout; text + icon size apply', async () => {
    const user = userEvent.setup();
    const { legend } = setup();
    expect(legend().style.display).toBe('flex');
    await user.click(screen.getByRole('radio', { name: '2 columns' }));
    expect(legend().style.display).toBe('grid'); expect(legend().style.gridTemplateColumns).toBe('repeat(2, max-content)');
    expect(legend().style.gridTemplateRows).toBe('repeat(3, auto)');
    await user.click(screen.getByRole('radio', { name: '3 columns' }));
    expect(legend().style.gridTemplateRows).toBe('repeat(2, auto)');
    await user.click(screen.getByRole('radio', { name: '1 column' }));
    expect(legend().style.gridTemplateRows).toBe('repeat(5, auto)');
    await user.click(screen.getByRole('radio', { name: '1 line' }));
    expect(legend().style.display).toBe('flex');

    fireEvent.change(screen.getByLabelText('Legend text size'), { target: { value: '1.4' } });
    expect(legend().style.getPropertyValue('--hb-legend-scale')).toBe('1.4');
    expect(screen.getByTestId('legend-font-pct').textContent).toBe('140 %');
    fireEvent.change(screen.getByLabelText('Legend icon size'), { target: { value: '1.5' } });
    expect(legend().style.getPropertyValue('--hb-legend-icon-scale')).toBe('1.5');
  });
  it('period entries (extra) appear in the editor and on the map', () => {
    const { legend } = setup([{ id: 'period:a', label: 'Winter', color: '#f59e0b', shape: 'line' }]);
    expect(within(legend()).getByText('Winter')).toBeTruthy();
    expect(screen.getByLabelText('Winter text')).toBeTruthy();
  });
});

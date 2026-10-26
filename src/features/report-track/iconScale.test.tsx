import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_ICON_SCALE, clampScale, effectiveScale, iconScaleVars, setItem, setMaster, type IconScaleState } from './iconScale';
import { IconSizeSection } from './IconSizeSection';

describe('iconScale', () => {
  it('default = 1 for every icon (design lock) and clamps', () => {
    expect(iconScaleVars(DEFAULT_ICON_SCALE)).toEqual({
      '--hb-icon-scale-release': '1', '--hb-icon-scale-latest': '1', '--hb-icon-scale-camps': '1', '--hb-icon-scale-stopovers': '1' });
    expect(clampScale(9)).toBe(2.5); expect(clampScale(0)).toBe(0.4);
  });
  it('master × item', () => {
    let s = setMaster(DEFAULT_ICON_SCALE, 1.5); s = setItem(s, 'camps', 1.2);
    expect(effectiveScale(s, 'release')).toBe(1.5); expect(effectiveScale(s, 'camps')).toBe(1.8);
  });
});

let latest: IconScaleState = DEFAULT_ICON_SCALE;
function Host() {
  const [v, setV] = useState(DEFAULT_ICON_SCALE); latest = v;
  return <div data-testid="frame" style={iconScaleVars(v)}><IconSizeSection value={v} onChange={setV} /></div>;
}
describe('IconSizeSection', () => {
  it('sliders and reset change the CSS variables on the map frame', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const frame = screen.getByTestId('frame');
    fireEvent.change(screen.getByLabelText('Release location icon size'), { target: { value: '1.6' } });
    expect(frame.style.getPropertyValue('--hb-icon-scale-release')).toBe('1.6');
    expect(frame.style.getPropertyValue('--hb-icon-scale-latest')).toBe('1');
    fireEvent.change(screen.getByLabelText('All icons size'), { target: { value: '1.5' } });
    expect(frame.style.getPropertyValue('--hb-icon-scale-latest')).toBe('1.5');
    expect(frame.style.getPropertyValue('--hb-icon-scale-release')).toBe('2.4');
    expect(screen.getByTestId('icon-master-pct').textContent).toBe('150 %');
    await user.click(screen.getByRole('button', { name: 'Reset icon sizes' }));
    expect(latest).toEqual(DEFAULT_ICON_SCALE);
    expect(frame.style.getPropertyValue('--hb-icon-scale-release')).toBe('1');
  });
});

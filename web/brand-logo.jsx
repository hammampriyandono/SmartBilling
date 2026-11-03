import React, {useId} from 'react';
import './brand-logo.css';

// Keep the previous identity available while the team reviews this proposal.
const activeLogo = 'team-proposal';

export function BrandLogo({tone = 'dark'}) {
  const filterId = useId();
  if (activeLogo === 'original') {
    return <img className="brand-logo" src={`/brand/archive/splitzbill-v1-${tone}.svg`} width="200" height="40" alt="" aria-hidden="true"/>;
  }
  return <svg className="brand-logo" viewBox="0 0 1979 404" width="1979" height="404" aria-hidden="true" focusable="false">
    {tone === 'dark' && <defs>
      <filter id={filterId} colorInterpolationFilters="sRGB">
        {/* Render the white lettering in navy while retaining the yellow bolt. */}
        <feColorMatrix type="matrix" values="0 0 -0.862745 0 1  0 0 -0.760784 0 1  0 0 0.337255 0 0  0 0 0 1 0"/>
      </filter>
    </defs>}
    <image href="/brand/splitzbill-team-proposal.png" width="1979" height="404" filter={tone === 'dark' ? `url(#${filterId})` : undefined}/>
  </svg>;
}

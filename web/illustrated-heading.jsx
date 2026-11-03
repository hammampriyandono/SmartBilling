import React from 'react';
import {Icon} from './interface-icon.jsx';
import './illustrated-heading.css';

export function IllustratedHeading({eyebrow, title, description, illustration, actions, children}) {
  return <header className="energy-hero illustrated-heading">
    <div className="hero-copy">
      <p className="eyebrow"><span/>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions && <div className="hero-actions">{actions}</div>}
      {children && <div className="hero-note">{children}</div>}
    </div>
    <img className="page-illustration" src={illustration} width="440" height="280" alt="" aria-hidden="true"/>
  </header>;
}

export function HeadingAction({icon = 'refresh', children, ...props}) {
  return <button type="button" {...props}><Icon name={icon} size={15}/>{children}</button>;
}

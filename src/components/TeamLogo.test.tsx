import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamLogo } from './TeamLogo';
import { sharedCompetitionLogo } from '../lib/sportsLogos';

test('renders a neutral placeholder with no image request when no logo is available', () => {
  const html = renderToStaticMarkup(<TeamLogo teamName="Arsenal Women" logo={null} />);
  assert.match(html, /lucide-shield/);
  assert.doesNotMatch(html, /<img|crest\d/);
});

test('renders the supplied logo without passing the referring page', () => {
  const html = renderToStaticMarkup(<TeamLogo teamName="Team" logo="/approved.png" />);
  assert.match(html, /src="\/approved\.png"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
});

test('competition heading requires every match to agree on verified ID and badge', () => {
  const logos = { competitionId: 'league:one', competition: '/one.png', home: null, away: null };
  assert.equal(sharedCompetitionLogo([{ logos }, { logos }]), '/one.png');
  assert.equal(sharedCompetitionLogo([{ logos }, {}]), null);
  assert.equal(sharedCompetitionLogo([{ logos }, { logos: { ...logos, competitionId: 'league:two' } }]), null);
  assert.equal(sharedCompetitionLogo([{ logos }, { logos: { ...logos, competition: '/changed.png' } }]), null);
});

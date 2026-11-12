// Gates G-D01 (source enumeration), G-D02 (requirement traceability), G-D06 (journey proportionality) and the
// test-data rules of G-D04. Called by validate-coverage.mjs,
// which supplies the shared helpers so the modules do not import each other. Every message starts with a
// stable prefix that evaluate.mjs classifies into its gate.
import { findSection, enumerateUnits, headings, squash } from './source-sections.mjs';

export const ENUMERATION = 'source enumeration:';
export const TRACEABILITY = 'requirement traceability:';
export const PROPORTIONALITY = 'journey proportionality:';
// Identifiers that look source-owned. Used only to reject an inventory that declares none while the authority has some.
const OWNED_ID = /\b(?:FR|NFR|REQ)-\d+\b/g;
const EMPTY_GROUP_STATUSES = ['Blocked', 'NotBrowserObservable', 'OutOfScope'];
// Inventories cite headings with or without their `#` markers, and may cite a leading part of the heading text.
const headingText = value => value.trim().replace(/^#+\s*/, '');
const sameHeading = (sectionHeading, cited) => headingText(sectionHeading).startsWith(headingText(cited)) && headingText(cited).length > 0;

const authorityFiles = (requirements, manifest) => {
  const excluded = new Set((manifest.scope?.exclusions || []).map(e => e.path));
  return [...new Set([...(manifest.scope?.authority || []), ...requirements.requirements.map(r => r.sourceReference.path)])]
    .filter(p => !excluded.has(p));
};

// G-D01: every content unit under every criteria heading is accounted for, independently of the extraction.
export function checkSourceEnumeration({ requirements, manifest, read, check, precise }) {
  if (requirements.schemaVersion !== '1.1' || !requirements.criteriaSections) {
    check(false, `${ENUMERATION} inventory schema ${requirements.schemaVersion} has no criteria-section accounting; regenerate the inventory as schema 1.1`);
    return;
  }
  const { headingPattern, sections = [], excludedSections = [] } = requirements.criteriaSections;
  let pattern;
  try { pattern = new RegExp(headingPattern); } catch { check(false, `${ENUMERATION} invalid headingPattern ${headingPattern}`); return; }
  const key = (p, h) => `${p}#${h.trim()}`;
  const declared = new Set([...sections, ...excludedSections].map(s => key(s.path, s.heading)));
  for (const file of authorityFiles(requirements, manifest)) {
    let content;
    try { content = read(file); } catch { continue; }
    for (const heading of headings(content).filter(h => pattern.test(h))) {
      check(declared.has(key(file, heading)), `${ENUMERATION} ${file} "${heading}" matches the criteria heading pattern but is neither enumerated nor excluded`);
    }
  }
  for (const excluded of excludedSections) check(precise(excluded.reason), `${ENUMERATION} excluded section ${excluded.path} "${excluded.heading}" needs a precise reason`);

  const claimed = new Map();
  const byId = new Map(requirements.requirements.map(r => [r.requirementId, r]));
  for (const section of sections) {
    const label = `${ENUMERATION} ${section.path} "${section.heading}"`;
    check(pattern.test(section.heading.trim()), `${label} does not match the criteria heading pattern`);
    const found = findSection(read(section.path), section.heading);
    if (found.error) { check(false, `${label}: ${found.error}`); continue; }
    const units = enumerateUnits(found.lines);
    const recorded = [...section.units].sort((a, b) => a.index - b.index);
    check(recorded.length === units.length && recorded.every((u, i) => u.index === i + 1),
      `${label} has ${units.length} content unit(s) but the inventory accounts for ${recorded.length} (indices ${recorded.map(u => u.index).join(', ') || 'none'})`);
    for (const unit of recorded) {
      const actual = units[unit.index - 1];
      if (!actual) continue;
      const where = `${label} unit ${unit.index}`;
      check(unit.kind === actual.kind, `${where} is a ${actual.kind}, not a ${unit.kind}`);
      if (unit.disposition === 'criterion') {
        for (const id of unit.requirementIds || []) {
          const requirement = byId.get(id);
          if (!requirement) { check(false, `${where} names unknown criterion ${id}`); continue; }
          check(requirement.sourceReference.path === section.path && sameHeading(section.heading, requirement.sourceReference.heading), `${where}: criterion ${id} cites a different section`);
          check(squash(actual.text).includes(squash(requirement.sourceText)), `${where}: text does not contain the source text of ${id}`);
          claimed.set(id, (claimed.get(id) || 0) + 1);
        }
      } else check(precise(unit.reason), `${where} (${unit.disposition}) needs a precise reason`);
    }
  }
  for (const r of requirements.requirements) check(claimed.has(r.requirementId), `${ENUMERATION} criterion ${r.requirementId} is not accounted to any enumerated source unit`);
}

// G-D02: source-owned identifiers are the primary traceability key; derived criteria hang under them.
export function checkRequirementGroups({ requirements, manifest, read, check, precise, rollup }) {
  const counts = { discovered: 0, traced: 0, applicable: false };
  if (requirements.schemaVersion !== '1.1' || !requirements.sourceIdentifiers) {
    check(false, `${TRACEABILITY} inventory schema ${requirements.schemaVersion} does not declare source identifiers; regenerate the inventory as schema 1.1`);
    return counts;
  }
  const declaration = requirements.sourceIdentifiers;
  const groups = requirements.requirementGroups || [];
  if (declaration.none) {
    check(precise(declaration.none), `${TRACEABILITY} "none" needs a precise reason`);
    check(groups.length === 0, `${TRACEABILITY} the inventory declares no source-owned identifiers but lists requirement groups`);
    const seen = new Set();
    for (const file of authorityFiles(requirements, manifest)) {
      try { for (const m of read(file).matchAll(OWNED_ID)) seen.add(m[0]); } catch { /* unresolved files are reported elsewhere */ }
    }
    check(seen.size === 0, `${TRACEABILITY} the inventory declares no source-owned identifiers, but the authority contains ${[...seen].sort().slice(0, 8).join(', ')}`);
    return counts;
  }
  counts.applicable = true;
  let pattern;
  try { pattern = new RegExp(declaration.pattern, 'g'); } catch { check(false, `${TRACEABILITY} invalid identifier pattern ${declaration.pattern}`); return counts; }
  const discovered = new Set();
  const sectionText = new Map();
  for (const s of declaration.sections) {
    const found = findSection(read(s.path), s.heading);
    if (found.error) { check(false, `${TRACEABILITY} ${s.path}: ${found.error}`); continue; }
    const body = found.lines.join('\n');
    sectionText.set(`${s.path}#${s.heading.trim()}`, body);
    for (const m of body.matchAll(pattern)) discovered.add(m[0]);
  }
  counts.discovered = discovered.size;
  const ids = groups.map(g => g.groupId);
  check(new Set(ids).size === ids.length, `${TRACEABILITY} duplicate requirement group IDs`);
  for (const id of [...discovered].sort()) check(ids.includes(id), `${TRACEABILITY} source-owned identifier ${id} is missing from the inventory's requirement groups`);
  const criteria = new Set(requirements.requirements.map(r => r.requirementId));
  const statusById = new Map((manifest.requirementGroups || []).map(g => [g.groupId, g.coverageStatus]));
  check(Array.isArray(manifest.requirementGroups), `${TRACEABILITY} the manifest has no requirementGroups rollup`);
  for (const group of groups) {
    const label = `${TRACEABILITY} ${group.groupId}`;
    check(discovered.has(group.groupId), `${label} is not declared in the cited traceability sections`);
    const body = sectionText.get(`${group.sourceReference.path}#${group.sourceReference.heading.trim()}`);
    check(body !== undefined, `${label} cites a section that is not a declared traceability section`);
    if (body !== undefined) check(squash(body).includes(squash(group.sourceText)), `${label} source text does not resolve in its section`);
    for (const id of group.requirementIds) check(criteria.has(id), `${label} names unknown criterion ${id}`);
    const status = statusById.get(group.groupId);
    check(status !== undefined, `${label} has no rolled-up status in the manifest`);
    if (group.requirementIds.length === 0) {
      check(precise(group.noCriterionReason), `${label} realizes no criterion and needs a precise noCriterionReason`);
      if (status !== undefined) check(EMPTY_GROUP_STATUSES.includes(status), `${label} realizes no criterion, so its status must be ${EMPTY_GROUP_STATUSES.join(', ')}`);
    } else if (status !== undefined) {
      const children = manifest.requirements.filter(r => group.requirementIds.includes(r.requirementId));
      check(status === rollup(children), `${label} false rollup: ${status} (expected ${rollup(children)})`);
    }
    if (status !== undefined && body !== undefined && discovered.has(group.groupId)) counts.traced++;
  }
  for (const id of statusById.keys()) check(ids.includes(id), `${TRACEABILITY} manifest status for unknown group ${id}`);
  if (groups.length) {
    const claimedCriteria = new Set(groups.flatMap(g => g.requirementIds));
    for (const id of [...criteria].sort()) check(claimedCriteria.has(id), `${TRACEABILITY} criterion ${id} is claimed by no requirement group`);
  }
  return counts;
}

// Test data: in lanes that create or reuse real records, every browser
// obligation states the data it needs, and an obligation that changes data needs the lane's cleanup contract.
export const TEST_DATA = 'test data:';
export function checkDataRequirements({ manifest, read, check }) {
  if (!manifest.setupDecisionsRef?.path) return;
  let setup;
  try { setup = JSON.parse(read(manifest.setupDecisionsRef.path)); } catch { return; }
  const lanes = new Map((setup.lanes || []).map(l => [l.laneId, l]));
  const defaultLane = setup.lanes?.[0];
  for (const o of manifest.obligations) {
    if (!o.evidenceLayer?.startsWith('Browser') || ['OutOfScope', 'NotBrowserObservable'].includes(o.coverageStatus)) continue;
    const req = o.dataRequirements;
    const lane = req?.lane ? lanes.get(req.lane) : defaultLane;
    if (req?.lane && !lane) { check(false, `${TEST_DATA} ${o.obligationId} names unknown lane ${req.lane}`); continue; }
    if (!lane || !['api-seeded', 'existing-dataset'].includes(lane.dataStrategy)) continue;
    if (!req) { check(false, `${TEST_DATA} ${o.obligationId}: precise data requirements required in ${lane.dataStrategy} lane ${lane.laneId} (entities, states, variants, mutates)`); continue; }
    const cleanup = lane.data?.cleanup?.mode || 'none';
    const readOnlyDataset = lane.dataStrategy === 'existing-dataset' && lane.data?.dataset?.readOnly && !lane.data?.dataset?.resetBy;
    if (req.mutates && ['Planned', 'Covered'].includes(o.coverageStatus) && (cleanup === 'none' || readOnlyDataset)) {
      check(false, `${TEST_DATA} ${o.obligationId} changes data but lane ${lane.laneId} has no cleanup contract; plan it Blocked with a precise blocker, remediation and owner`);
    }
  }
}

export function groupProjections(requirements, manifest) {
  const statusById = new Map((manifest.requirementGroups || []).map(g => [g.groupId, g.coverageStatus]));
  return (requirements.requirementGroups || []).map(g => ({ groupId: g.groupId, coverageStatus: statusById.get(g.groupId) ?? null,
    requirementIds: [...g.requirementIds].sort() })).sort((a, b) => a.groupId.localeCompare(b.groupId));
}

// G-D06: journey counts must follow obligations. Tests count once authored; planned journeys count before that.
export function checkJourneyProportionality({ requirements, manifest, read, check }) {
  const planOf = new Map();
  for (const p of manifest.artifacts?.plans || []) for (const id of p.obligationIds) planOf.set(id, p.path);
  for (const o of manifest.obligations) {
    for (const journey of o.plannedJourneys || []) {
      const plan = planOf.get(o.obligationId);
      let content = '';
      try { content = plan ? read(plan) : ''; } catch { /* missing plans are reported elsewhere */ }
      check(new RegExp(`\\b${journey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(content), `${PROPORTIONALITY} ${o.obligationId} plans ${journey}, which its plan ${plan || '(none)'} does not define`);
    }
  }
  if (manifest.scope?.type === 'smoke-sample') return;
  const stories = [...new Set(requirements.requirements.map(r => r.storyId))];
  const rows = stories.map(story => {
    const criteria = requirements.requirements.filter(r => r.storyId === story).map(r => r.requirementId);
    const obligations = manifest.obligations.filter(o => criteria.includes(o.requirementId));
    const journeys = new Set();
    for (const o of obligations) {
      if (o.testIds?.length) o.testIds.forEach(t => journeys.add(`test:${t}`));
      else (o.plannedJourneys || []).forEach(j => journeys.add(`plan:${planOf.get(o.obligationId)}#${j}`));
    }
    const unblocked = obligations.filter(o => o.evidenceLayer.startsWith('Browser') && ['Planned', 'Covered'].includes(o.coverageStatus)).length;
    return { story, criteria: criteria.length, journeys: journeys.size, unblocked };
  });
  for (const r of rows) {
    check(r.journeys >= r.unblocked, `${PROPORTIONALITY} ${r.story} has ${r.journeys} journey(s) for ${r.unblocked} unblocked browser-observable obligation(s); add journeys or record a precise blocker for each unmatched obligation`);
  }
  if (rows.length >= 3 && new Set(rows.map(r => r.journeys)).size === 1) {
    const counts = rows.map(r => r.criteria);
    const [min, max] = [Math.min(...counts), Math.max(...counts)];
    check(!(max >= 2 * min && max - min >= 3), `${PROPORTIONALITY} every story has ${rows[0].journeys} journey(s) although criterion counts range from ${min} to ${max}, which is presumptive sampling (${rows.map(r => `${r.story} ${r.criteria}:${r.journeys}`).join(', ')}); justify per story or use an explicit smoke-sample scope`);
  }
}

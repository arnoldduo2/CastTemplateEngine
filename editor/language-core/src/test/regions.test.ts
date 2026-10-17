import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCast } from '../index.js';

test('classifies non-overlapping embedded language regions', () => {
  const result = analyzeCast('@if ($ok)\n@php($x = 1)\n@css(.a { color: @{ $x }; })\n@js(console.log(1))\n@endif');

  assert.deepEqual(result.regions.map((region) => region.kind), ['php', 'php', 'css', 'php', 'javascript']);
  assert.equal(result.directives[0].nameRange.text, '@if');
});

test('@map/@filter PHP region stops before a trailing return(<markup/>)/@render(<markup/>) - markup is not PHP', () => {
  const mapSrc = "@map($items, ($item, $i) => return(<Card key={$i}>@{ $item->name }</Card>))";
  const mapRegion = analyzeCast(mapSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'map');
  assert.ok(mapRegion, 'a php region exists for the @map call');
  assert.equal(mapRegion!.range.text, '$items, ($item, $i) => ', 'stops right before return(, never includes the markup');

  const renderSrc = "@map($items, ($item, $i) => @render(<Card>@{ $item->name }</Card>))";
  const renderRegion = analyzeCast(renderSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'map');
  assert.equal(renderRegion!.range.text, '$items, ($item, $i) => ', '@render(...) is excluded the same way as return(...)');

  // @filter's 2-arg standalone form has no return()/markup at all - a plain PHP predicate - so nothing is excluded
  const filterSrc = "@filter($items, ($item) => $item->qty > 0)";
  const filterRegion = analyzeCast(filterSrc).regions.find((region) => region.kind === 'php' && region.owner?.name === 'filter');
  assert.equal(filterRegion!.range.text, "$items, ($item) => $item->qty > 0");
});

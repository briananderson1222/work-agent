export function getModelDisplayName(model: string): string {
  if (model.includes('claude-3-7-sonnet')) return '🤖 Claude 3.7 Sonnet';
  if (model.includes('claude-3-5-sonnet-20241022'))
    return '🤖 Claude 3.5 Sonnet v2';
  if (model.includes('claude-3-5-sonnet')) return '🤖 Claude 3.5 Sonnet';
  if (model.includes('claude-3-opus')) return '🤖 Claude 3 Opus';
  if (model.includes('claude-3-haiku')) return '🤖 Claude 3 Haiku';
  return '🤖 Custom';
}

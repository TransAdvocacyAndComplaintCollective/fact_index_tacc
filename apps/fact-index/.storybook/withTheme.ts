export function withTheme<TStory extends { globals?: Record<string, any> }>(
  story: TStory,
  theme: 'light' | 'dark'
): TStory {
  return {
    ...story,
    globals: { ...(story.globals ?? {}), theme },
  };
}

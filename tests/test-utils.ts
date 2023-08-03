export const itWhen = (condition: boolean) => (condition ? it : it.skip);

export const itWhenCI = itWhen(process.env.CI === 'true');

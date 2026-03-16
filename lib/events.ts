export interface EventConfig {
  id: string;
  name: string;
  csvUrl: string;
  templateId: string;
  year: number;
}

export const events: EventConfig[] = [
  {
    id: 'tech-vista',
    name: 'Tech Vista',
    csvUrl: 'https://docs.google.com/spreadsheets/d/1Xpo9zMWtNGDuSHc1NpwfjOYjz25juQj8paVSbMp7cnM/export?format=csv&gid=0',
    templateId: '1IAck6nmrOXlbU3YlceRoptCeyNe7R39AwtDzABgrwVw',
    year: 2026,
  },
  {
    id: 'innofest',
    name: 'InnoFest',
    csvUrl: 'https://docs.google.com/spreadsheets/d/1ZZuW84sgRhGLlYQZlOkHCM0e-4NPQAy-An4Vfk7TsD0/export?format=csv&gid=0',
    templateId: '1iduKnek5unNSYyKxKlLIUDTmBFXEZHNAIHWdUCr0ZjE',
    year: 2026,
  },
  {
    id: 'code-summit',
    name: 'Code Summit',
    csvUrl: 'https://docs.google.com/spreadsheets/d/10HFjtF4-2CYYw0wZXIqGrW38CG3KaP_wsAemhZp0ciA/export?format=csv&gid=0',
    templateId: '1LFLV9foVrywpiZGb7gSVlUAWu0fi8W2FIohZW9CUJTc',
    year: 2026,
  },
  {
    id: 'code-chaos',
    name: 'Code Chaos',
    csvUrl: 'https://docs.google.com/spreadsheets/d/1iDHcTgscxKAPFbH6tTK_hkBzNHEL_u_s0BhijhG9Stg/export?format=csv&gid=0',
    templateId: '1A6qAZDLid_FpNW8alz9k5K7aDRLHYGFXd1GwLDzzVJw',
    year: 2026,
  },
  {
    id: 'frame-fusion',
    name: 'Frame Fusion',
    csvUrl: 'https://docs.google.com/spreadsheets/d/15npVHHfafgokb21dxC6I67tBYGngCvYAtYC-uNmr3qU/export?format=csv&gid=0',
    templateId: '1ad4su4mUQmQrYH-zdthLGcqMcwfb2nBXRSorKjiRYdY',
    year: 2026,
  },
  {
    id: 'hack-relay',
    name: 'Hack Relay',
    csvUrl: 'https://docs.google.com/spreadsheets/d/12N7EXupt3m99WgshahJ1oLUXUQd33mlnQzb2SWwBcv4/export?format=csv&gid=303944953',
    templateId: '1xvTiISq7DL2330Eoun-viHnhIaEuU2a0JHByDPUKW4E',
    year: 2026,
  },
];

export function getEventByNameOrId(eventParam: string): EventConfig | undefined {
  const lowerParam = eventParam.toLowerCase();
  // First try ID matching
  let event = events.find((e) => e.id === lowerParam);
  if (!event) {
    // Then try name matching
    event = events.find((e) => 
      e.name.toLowerCase() === lowerParam || 
      e.name.toLowerCase().replace(/ /g, '-') === lowerParam
    );
  }
  return event;
}

export function validateEventConfig(event: EventConfig): boolean {
  return !!event.csvUrl;
}

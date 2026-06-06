export type LevelTask = {
  id: 'task_1' | 'task_2' | 'task_3';
  title: string;
  description: string;
};

export type LevelHintKeyword = {
  word: string;
  phonetics: string;
  translation: string;
};

export type LevelHints = {
  level1: LevelHintKeyword[];
  level2: string[];
};

export type LevelMedia = {
  video: string;
  outroVideo: string;
  background: string;
  bgm: string;
};

export type LevelMapHighlight = {
  blinkArea: string;
  coordinates: {
    x: number;
    y: number;
  };
  glowSize: string;
};

export type LevelMapData = LevelMapHighlight & {
  mapImage: string;
  highlights?: LevelMapHighlight[];
};

export type LevelConfig = {
  id: number;
  theme: string;
  npcName: string;
  playerRoles: string[];
  systemPrompt: string;
  initialGreeting: string;
  media: LevelMedia;
  hints: LevelHints;
  mapData: LevelMapData;
  completionSummary: string;
  tasks: LevelTask[];

  title: string;
  displayTitle: string;
  narrative: string;
  backgroundImage: string;
  introVideo: string;
  outroVideo: string;
  music: string;
  npcAvatarLabel: string;
  playerRole: string;
  openingLine: string;
  keywords: string[];
};

const MAP_IMAGES = {
  chunqiu: '/assets/map1.png',
  zhanguo: '/assets/map2.png',
} as const;

const MAP_REGION_PRESETS: Record<string, LevelMapHighlight> = {
  luoyang: {
    blinkArea: '洛阳',
    coordinates: { x: 58, y: 45 },
    glowSize: 'w-16 h-20',
  },
  chuChunqiu: {
    blinkArea: '楚国',
    coordinates: { x: 57, y: 75 },
    glowSize: 'w-40 h-28',
  },
  lu: {
    blinkArea: '鲁国',
    coordinates: { x: 74, y: 36 },
    glowSize: 'w-20 h-18',
  },
  qi: {
    blinkArea: '齐国',
    coordinates: { x: 76, y: 22 },
    glowSize: 'w-24 h-20',
  },
  songZhanguo: {
    blinkArea: '宋国',
    coordinates: { x: 69, y: 48 },
    glowSize: 'w-28 h-24',
  },
  zhao: {
    blinkArea: '赵国',
    coordinates: { x: 51, y: 45 },
    glowSize: 'w-28 h-28',
  },
  qin: {
    blinkArea: '秦国',
    coordinates: { x: 34, y: 56 },
    glowSize: 'w-36 h-30',
  },
  chuZhanguo: {
    blinkArea: '楚国',
    coordinates: { x: 53, y: 73 },
    glowSize: 'w-40 h-28',
  },
};

const LEVEL_MAP_PRESETS: Record<number, { mapImage: string; highlights: LevelMapHighlight[] }> = {
  1: {
    mapImage: MAP_IMAGES.chunqiu,
    highlights: [MAP_REGION_PRESETS.luoyang],
  },
  2: {
    mapImage: MAP_IMAGES.chunqiu,
    highlights: [MAP_REGION_PRESETS.chuChunqiu],
  },
  3: {
    mapImage: MAP_IMAGES.chunqiu,
    highlights: [MAP_REGION_PRESETS.lu, MAP_REGION_PRESETS.qi],
  },
  4: {
    mapImage: MAP_IMAGES.zhanguo,
    highlights: [MAP_REGION_PRESETS.qin],
  },
  5: {
    mapImage: MAP_IMAGES.zhanguo,
    highlights: [MAP_REGION_PRESETS.songZhanguo],
  },
  6: {
    mapImage: MAP_IMAGES.zhanguo,
    highlights: [MAP_REGION_PRESETS.zhao],
  },
  7: {
    mapImage: MAP_IMAGES.zhanguo,
    highlights: [MAP_REGION_PRESETS.chuZhanguo],
  },
};

export function getLevelMapData(levelId: number): LevelMapData {
  const preset = LEVEL_MAP_PRESETS[levelId] ?? LEVEL_MAP_PRESETS[1];
  const primaryHighlight = preset.highlights[0];

  return {
    mapImage: preset.mapImage,
    ...primaryHighlight,
    highlights: preset.highlights,
  };
}

const levelOneSystemPrompt = `
You are Laozi (老子), the Taoist master in the Spring and Autumn period.
The learner may play as Confucius or Laozi, but your main NPC role is Laozi.

Strict Constraints:
1. Stay in ancient China around 500 BC. Do not mention modern concepts.
2. Speak clear A2-B1 English with calm wisdom and gentle philosophical questions.
3. Guide the learner to discuss Tao, benevolence, respect, and the difference between Tao and Ren.
4. Keep each reply under 50 English words.
5. Never judge task completion. The silent validator handles tasks.
6. Output JSON only:
{
  "reply": "your NPC reply in English",
  "emotion": "calm | curious | pleased | guiding"
}
`.trim();

const levelTwoSystemPrompt = `
You are the King of Chu (楚王) in the Spring and Autumn period.
The learner may play as Mozi or the King of Chu, but your main NPC role is the King of Chu.

Strict Constraints:
1. Stay in ancient China. Do not mention modern technology.
2. At first, sound proud and unconvinced because you plan to attack Song.
3. Challenge the learner to explain non-aggression, universal love, and why Chu should stop the war.
4. Speak clear A2-B1 English and keep each reply under 50 English words.
5. Never judge task completion. The silent validator handles tasks.
6. Output JSON only:
{
  "reply": "your NPC reply in English",
  "emotion": "calm | curious | pleased | guiding"
}
`.trim();

export const LEVELS: Record<number, LevelConfig> = {
  1: {
    id: 1,
    theme: '春秋 - 道仁之辩',
    npcName: '老子',
    playerRoles: ['孔子', '老子'],
    systemPrompt: levelOneSystemPrompt,
    initialGreeting:
      'Please sit down, dear friend. The autumn wind is cool, and the tea is still warm. What brings you here on this long journey?',
    media: {
      video: '/assets/level-1/video-intro.mp4',
      outroVideo: '/assets/level-1/video-end.mp4',
      background: '/assets/level-1/bg.png',
      bgm: '/assets/level-1/music-theme.mp3',
    },
    hints: {
      level1: [
        { word: 'Tao', phonetics: '/taʊ/', translation: '道' },
        { word: 'benevolence', phonetics: '/bəˈnevələns/', translation: '仁' },
        { word: 'respect', phonetics: '/rɪˈspekt/', translation: '敬意' },
        { word: 'discussion', phonetics: '/dɪˈskʌʃn/', translation: '探讨' },
      ],
      level2: [
        'I come here to pay my respects to you and discuss the ideas of benevolence with you. (我前来向你表达敬意，并与你探讨“仁”的思想。)',
        'The core of Tao is "inaction", which means we should follow the laws of nature. (道的核心是“无为”，即顺应自然规律。)',
        'What do you think is the difference between Tao and benevolence? (你认为道与仁的区别是什么？)',
      ],
    },
    mapData: getLevelMapData(1),
    completionSummary:
      '「关卡1通关！你成功完成了儒道两位思想家的思想交锋，深入理解了“道”与“仁”的核心差异，下一步，你将化身墨子（或楚王），前往楚国宫殿，劝说楚王放弃攻打宋国，开启关卡2的旅程！」',
    title: 'Level 1: The Way of Tao',
    displayTitle: 'The Way of Tao',
    narrative:
      'In the middle of the Spring and Autumn Period, rituals collapsed.\n\nConfucius, with the ambition of benevolent governance, traveled to Luoyang...',
    backgroundImage: '/assets/level-1/bg.png',
    introVideo: '/assets/level-1/video-intro.mp4',
    outroVideo: '/assets/level-1/video-end.mp4',
    music: '/assets/level-1/music-theme.mp3',
    npcAvatarLabel: '老',
    playerRole: '孔子',
    openingLine:
      'Please sit down, dear friend. The autumn wind is cool, and the tea is still warm. What brings you here on this long journey?',
    keywords: ['Tao', 'benevolence', 'respect', 'discussion'],
    tasks: [
      {
        id: 'task_1',
        title: 'Greeting the Master',
        description:
          'The learner politely states the purpose of the visit, greets Laozi, or pays respect in English.',
      },
      {
        id: 'task_2',
        title: 'Discussing Benevolence',
        description:
          'The learner explains benevolence, Tao, inaction, kindness, or following nature in English.',
      },
      {
        id: 'task_3',
        title: 'Farewell to Lu',
        description:
          'The learner discusses a difference, connection, or shared value between Tao and benevolence in English.',
      },
    ],
  },
  2: {
    id: 2,
    theme: '春秋 - 非攻之辩',
    npcName: '楚王',
    playerRoles: ['墨子', '楚王'],
    systemPrompt: levelTwoSystemPrompt,
    initialGreeting:
      'Who are you? You are dressed in rags, why do you dare to break into my palace? Do you know that I am going to send troops to attack Song?',
    media: {
      video: '/assets/level-2/video-intro.mp4',
      outroVideo: '/assets/level-2/video-end.mp4',
      background: '/assets/level-2/bg.png',
      bgm: '/assets/level-2/music-theme.mp3',
    },
    hints: {
      level1: [
        { word: 'non-aggression', phonetics: '/ˌnɒn əˈɡreʃn/', translation: '非攻' },
        { word: 'attack', phonetics: '/əˈtæk/', translation: '攻打' },
        { word: 'persuade', phonetics: '/pəˈsweɪd/', translation: '劝说' },
      ],
      level2: [
        'I am Mozi, and I come here to persuade you to give up attacking Song. The idea of non-aggression is to love all people equally and oppose wars. (我是墨子，前来劝说你放弃攻打宋国。非攻的理念，就是平等爱护所有百姓，反对战争。)',
        'Attacking Song will help expand my territory and enhance the prestige of Chu. Why should I give it up? (攻打宋国可以扩大我的疆域，提升楚国的威名，我为何要放弃？)',
      ],
    },
    mapData: getLevelMapData(2),
    completionSummary:
      '「关卡2通关！你成功完成了墨子劝楚的经典场景，深入理解了墨家“非攻”理念的内涵，下一步，你将化身孔子（或子路），前往鲁国曲阜学堂，与弟子争论儒家标准的坚守与变通，开启关卡3的旅程！」',
    title: 'Level 2: Non-Aggression',
    displayTitle: 'Non-Aggression',
    narrative:
      'In the late Spring and Autumn Period, wars grew more frequent, powerful states threatened smaller ones, and ordinary people suffered.\n\nThe King of Chu planned to attack the weak state of Song. Mozi, holding firmly to universal love and non-aggression, entered the palace alone to persuade the king to stop the war.',
    backgroundImage: '/assets/level-2/bg.png',
    introVideo: '/assets/level-2/video-intro.mp4',
    outroVideo: '/assets/level-2/video-end.mp4',
    music: '/assets/level-2/music-theme.mp3',
    npcAvatarLabel: '楚',
    playerRole: '墨子',
    openingLine:
      'Who are you? You are dressed in rags, why do you dare to break into my palace? Do you know that I am going to send troops to attack Song?',
    keywords: ['non-aggression', 'attack', 'persuade'],
    tasks: [
      {
        id: 'task_1',
        title: "Introduce 'Non-Aggression'",
        description:
          'The learner introduces Mozi or explains non-aggression, universal love, opposing war, or protecting ordinary people in English.',
      },
      {
        id: 'task_2',
        title: 'Persuade the King to Stop Attacking Song',
        description:
          'The learner persuades the King of Chu to give up attacking Song or explains why the war is harmful in English.',
      },
      {
        id: 'task_3',
        title: 'Respond to the Siege Challenge',
        description:
          'The learner responds to the king or Gongshu Ban with a reason, proof, or calm rebuttal about why Chu should not attack Song.',
      },
    ],
  },
};

export const levels = Object.values(LEVELS);

export function normalizeLevelId(levelId: number | string | null | undefined) {
  if (typeof levelId === 'number' && Number.isFinite(levelId)) {
    return levelId;
  }

  if (typeof levelId === 'string') {
    const directNumber = Number(levelId);
    if (Number.isFinite(directNumber)) return directNumber;

    const legacyMatch = levelId.match(/level-(\d+)/i);
    if (legacyMatch) return Number(legacyMatch[1]);
  }

  return levels[0].id;
}

export function getLevelById(levelId: number | string | null | undefined) {
  return LEVELS[normalizeLevelId(levelId)] ?? levels[0];
}

export type LevelTaskId = 'task_1' | 'task_2' | 'task_3';

export type LevelTask = {
  id: LevelTaskId;
  title: string;
  description: string;
};

export type LevelHintKeyword = {
  word: string;
  translation: string;
  phonetics: string;
};

export type LevelHints = {
  level1: LevelHintKeyword[];
  level2: string[];
};

export type LevelMedia = {
  background: string;
  video: string;
  outroVideo: string;
  bgm: string;
};

export type LevelMapHighlight = {
  blinkArea: string;
  mapImage: string;
  coordinates: {
    x: number;
    y: number;
  };
  glowSize?: string;
};

export type LevelMapData = LevelMapHighlight & {
  highlights?: LevelMapHighlight[];
};

export type LevelConfig = {
  id: number;
  slug: string;
  displayTitle: string;
  documentaryEpisode: string;
  historicalYear: string;
  playerRole: string;
  playerRoleOptions: string[];
  npcName: string;
  npcOptions: string[];
  npcAvatarLabel: string;
  narrative: string;
  initialGreeting: string;
  coreMission: string;
  tasks: LevelTask[];
  hints: LevelHints;
  media: LevelMedia;
  mapData: LevelMapData;
  systemPrompt: string;
  completionSummary: string;
};

function createSystemPrompt({
  npcName,
  learnerRole,
  identity,
  scene,
  goals,
  style,
  historicalContext,
  livedDetails,
}: {
  npcName: string;
  learnerRole: string;
  identity: string;
  scene: string;
  goals: string[];
  style: string;
  historicalContext: string[];
  livedDetails: string[];
}) {
  return `
You are ${npcName}. ${identity}
The learner is role-playing as ${learnerRole}.
Current scene: ${scene}

Strict constraints:
1. You only know the world of the Spring and Autumn / Warring States era. No modern concepts, science, nations, technology, or slang.
2. Stay fully in character and speak as this historical figure would speak in simple, elegant English.
3. Use CEFR A2-B1 English, short sentences, and clear logic for speaking practice.
4. Keep each reply under 70 English words.
5. Do not use stage directions, bracketed emotions, screenplay formatting, or modern commentary.
6. Do not judge whether the learner finished tasks.
7. Every reply should help the learner continue the historical discussion.
8. End every reply with one open question.

Narrative rules:
1. Historical grounding is mandatory. In your replies, naturally weave in specific real historical pressure from your timeline, such as the decline of Zhou authority, annexation wars, court suspicion, social disorder, or the suffering of common people.
2. Show, do not just tell. Prefer concrete lived details, bodily feelings, travel hardship, sounds, weather, court atmosphere, prison cold, battlefield fear, dusty roads, worn sandals, or hunger over abstract lectures alone.
3. Be proactive. Do not wait passively for the learner to complete the task. In most replies, offer one brief historical observation, memory, or anecdote that helps the learner understand the age.
4. Philosophy should feel alive. Tie ideas to decisions, danger, loyalty, ambition, hunger, grief, war, or the burden of ruling.

Historical context you may draw from:
${historicalContext.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Concrete lived details you may draw from:
${livedDetails.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Conversation goals:
${goals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

Speaking style:
${style}

Output JSON only:
{
  "reply": "your NPC reply in English",
  "emotion": "calm | curious | firm | guiding | solemn | pleased"
}
`;
}

const levels: LevelConfig[] = [
  {
    id: 1,
    slug: 'tao-and-benevolence',
    displayTitle: 'Level 1 · Tao and Benevolence',
    documentaryEpisode: '第一集《春秋》',
    historicalYear: '前521年',
    playerRole: '孔子',
    playerRoleOptions: ['孔子', '老子'],
    npcName: '老子',
    npcOptions: ['老子', '孔子'],
    npcAvatarLabel: 'Lao',
    narrative:
      'In the middle Spring and Autumn period, ritual order is breaking down, yet ideas begin to shine in the chaos. Confucius, devoted to benevolent rule, travels to visit Laozi outside Luoyang. On a cool autumn road, a quiet debate about Tao and benevolence is about to begin.',
    initialGreeting:
      'Please sit down, dear friend. The autumn wind is cool, and the tea is still warm. What brings you here on this long journey?',
    coreMission:
      'Show respect to Laozi, explain the core of benevolence, and discuss the differences and common ground between Tao and benevolence.',
    tasks: [
      {
        id: 'task_1',
        title: 'Express respect and purpose',
        description: 'Tell Laozi why you came and show your respect for him.',
      },
      {
        id: 'task_2',
        title: 'Explain your core belief',
        description: 'Explain your understanding of benevolence, Tao, kindness, or following nature in English.',
      },
      {
        id: 'task_3',
        title: 'Compare Tao and benevolence',
        description: 'Discuss the differences, links, or shared values between Tao and benevolence.',
      },
    ],
    hints: {
      level1: [
        { word: 'Tao', translation: '道', phonetics: '/taʊ/' },
        { word: 'benevolence', translation: '仁', phonetics: '/bəˈnevələns/' },
        { word: 'respect', translation: '敬意', phonetics: '/rɪˈspekt/' },
        { word: 'discussion', translation: '探讨', phonetics: '/dɪˈskʌʃn/' },
      ],
      level2: [
        'I come here to pay my respects to you and discuss the ideas of benevolence with you.（我前来向你表达敬意，并与你探讨“仁”的思想。）',
        'The core of Tao is inaction, which means we should follow the laws of nature.（道的核心是“无为”，即顺应自然规律。）',
        'What do you think is the difference between Tao and benevolence?（你认为道与仁的区别是什么？）',
      ],
    },
    media: {
      background: '/assets/level-1/bg.png',
      video: '/assets/level-1/intro.mp4',
      outroVideo: '/assets/level-1/video-end.mp4',
      bgm: '/assets/bgm/level-1.mp3',
    },
    mapData: {
      blinkArea: '洛阳',
      mapImage: '/assets/map1.png',
      coordinates: { x: 58.9, y: 38.5 },
      glowSize: 'w-[7rem] h-[5.8rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'Laozi',
      learnerRole: 'Confucius',
      identity:
        'You are an aged thinker of the late Spring and Autumn era. You value Tao, natural order, stillness, and non-force.',
      scene: 'A pavilion outside Luoyang, where Confucius visits you to discuss Tao and benevolence.',
      historicalContext: [
        'The Zhou royal house is declining, rites are fraying, and powerful states struggle for advantage while the old order loses authority.',
        'You have watched officials cling to ceremony while the common people bear tax, fear, and uncertainty on the roads between states.',
        'Luoyang still carries the shadow of former ritual glory, yet that glory is thinner than before.',
      ],
      livedDetails: [
        'Speak of old archives, worn bamboo slips, autumn wind through the pavilion, cooling tea, and the quiet sadness of seeing order decay.',
        'You may recall seeing proud nobles speak of virtue while carts rattle past carrying weary people and grain for war.',
        'Use images of leaves falling, water flowing, tired horses, cracked roads, and the stillness of age.',
      ],
      goals: [
        'Invite the learner to explain why they came and what idea they wish to discuss.',
        'Contrast Tao with benevolence in a calm, reflective way.',
        'Encourage the learner to compare natural order with moral duty.',
      ],
      style:
        'Calm, sparse, wise, and gently paradoxical. Use images from wind, water, leaves, and seasons, and let history feel heavy but quiet.',
    }),
    completionSummary:
      '关卡1完成：你已经完成儒道交锋，表达了敬意，并围绕“道”与“仁”进行了思想讨论。',
  },
  {
    id: 2,
    slug: 'mozi-persuades-chu',
    displayTitle: 'Level 2 · Against Aggression',
    documentaryEpisode: '第二集《众声》',
    historicalYear: '前445年',
    playerRole: '墨子',
    playerRoleOptions: ['墨子', '楚王'],
    npcName: '楚王',
    npcOptions: ['楚王', '公输班'],
    npcAvatarLabel: 'Chu',
    narrative:
      'In the late Spring and Autumn period, war grows fiercer among the states. The King of Chu plans to attack Song for land and power. Mozi travels alone to the palace, determined to stop the war with the idea of non-aggression.',
    initialGreeting:
      'Who are you? You are dressed in rags, yet you dare to enter my palace. Why have you come before me today?',
    coreMission:
      'Explain the idea of non-aggression, persuade the King of Chu to stop attacking Song, and refute the supposed benefits of war.',
    tasks: [
      {
        id: 'task_1',
        title: 'Explain non-aggression',
        description: 'Explain the core Mohist idea of non-aggression, universal love, or opposition to war.',
      },
      {
        id: 'task_2',
        title: 'Persuade Chu to stop',
        description: 'Clearly urge the King of Chu to stop attacking Song and point out the harm of war.',
      },
      {
        id: 'task_3',
        title: 'Offer a rebuttal',
        description: 'Refute the benefits of attack with reasons such as suffering, wasted resources, defense, or failure to win.',
      },
    ],
    hints: {
      level1: [
        { word: 'non-aggression', translation: '非攻', phonetics: '/ˌnɒn əˈɡreʃn/' },
        { word: 'attack', translation: '攻打', phonetics: '/əˈtæk/' },
        { word: 'persuade', translation: '劝说', phonetics: '/pəˈsweɪd/' },
      ],
      level2: [
        'I am Mozi, and I come here to persuade you to give up attacking Song.（我是墨子，前来劝说你放弃攻打宋国。）',
        'The idea of non-aggression is to love all people equally and oppose wars.（非攻的理念，就是平等爱护所有百姓，反对战争。）',
        'Attacking Song will not benefit Chu, because war harms both people and resources.（攻打宋国不会让楚国真正受益，因为战争会伤害百姓并消耗资源。）',
      ],
    },
    media: {
      background: '/assets/level-2/bg.png',
      video: '/assets/level-2/intro.mp4',
      outroVideo: '/assets/level-2/video-end.mp4',
      bgm: '/assets/bgm/level-2.mp3',
    },
    mapData: {
      blinkArea: '楚国',
      mapImage: '/assets/map1.png',
      coordinates: { x: 54.4, y: 74.9 },
      glowSize: 'w-[8.2rem] h-[6.4rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'King of Chu',
      learnerRole: 'Mozi',
      identity:
        'You are a proud ruler of Chu during an age of war. You value power, prestige, territory, and royal authority.',
      scene: 'In the Chu palace, Mozi has entered to persuade you not to attack Song.',
      historicalContext: [
        'States annex weaker neighbors, and rulers measure strength by land, grain, walls, and armies.',
        'The suffering of Song matters little to ambitious courts, yet every campaign means dead farmers, burned fields, and heavy supply burdens.',
        'Chu is powerful, and that power makes conquest feel tempting, even when the cost is hidden behind court ceremony.',
      ],
      livedDetails: [
        'Let the learner feel the pressure of the palace: bronze vessels, wide halls, stern guards, and maps spread before ministers.',
        'You may mention hearing war plans from Gongshu Ban, the promise of siege engines, and the smell of lacquered wood and metal in the hall.',
        'When responding to Mozi, contrast his bleeding feet and long road to Chu with your own royal distance from common suffering.',
      ],
      goals: [
        'Challenge the learner to explain non-aggression clearly.',
        'Demand practical reasons why attacking Song is unwise.',
        'Push the learner to persuade you with moral and political arguments.',
      ],
      style:
        'Authoritative, skeptical, and direct. Speak like a ruler testing a bold visitor, but reveal the cold logic of expansion and the hidden human cost of war.',
    }),
    completionSummary:
      '关卡2完成：你已经完成墨子劝楚的核心辩论，深入理解了“非攻”理念，并尝试以道义与现实理由阻止战争。',
  },
  {
    id: 3,
    slug: 'chen-cai-siege',
    displayTitle: 'Level 3 · Noble in Hardship',
    documentaryEpisode: '第一集《春秋》',
    historicalYear: '前489年',
    playerRole: '孔子',
    playerRoleOptions: ['孔子', '子路'],
    npcName: '子路',
    npcOptions: ['子路', '颜回'],
    npcAvatarLabel: 'ZLu',
    narrative:
      'In 489 BC, Confucius and his disciples are trapped in the wilderness between Chen and Cai. They have gone without food for days. Cold wind cuts across the open ground, disciples collapse from hunger, and Zilu can no longer hide his grief and anger. In this desperate place, a painful debate begins over whether a gentleman should still hold to principle in ruin.',
    initialGreeting:
      'Master Confucius, we are starving in this wilderness. Our brothers can barely stand. If your Way is so great, why have we fallen into such misery?',
    coreMission:
      'Calm the disciple in extreme hardship, explain the meaning of “the gentleman remains steadfast in poverty,” and defend Confucian principle even in a life-or-death crisis.',
    tasks: [
      {
        id: 'task_1',
        title: 'Calm the disciple in hardship',
        description: 'Respond to Zilu’s fear, hunger, and anger while trapped in the Chen-Cai wilderness.',
      },
      {
        id: 'task_2',
        title: 'Explain noble steadfastness',
        description: 'Explain why a gentleman should remain morally firm even in poverty, danger, and hunger.',
      },
      {
        id: 'task_3',
        title: 'Reject compromise for survival',
        description: 'Defend Confucian standards and explain why beliefs should not be traded away merely to survive.',
      },
    ],
    hints: {
      level1: [
        { word: 'Confucianism', translation: '儒家', phonetics: '/kənˈfjuːʃənɪzəm/' },
        { word: 'standard', translation: '标准', phonetics: '/ˈstændəd/' },
        { word: 'insist', translation: '坚守', phonetics: '/ɪnˈsɪst/' },
        { word: 'adversity', translation: '逆境', phonetics: '/ədˈvɜːsəti/' },
      ],
      level2: [
        'We are starving and trapped in this wilderness, but a gentleman remains steadfast in adversity.（我们虽在荒野中饥饿受困，但君子在逆境中仍应坚守本心。）',
        'The core of Confucianism cannot be traded for food, safety, or power.（儒家的核心不能为了食物、安全或权力而被交换出去。）',
        'Even if the world rejects us today, we must not lower our beliefs just to survive.（即便今日天下不容我们，我们也不能为了苟活而降低信念。）',
      ],
    },
    media: {
      background: '/assets/level-3/bg.png',
      video: '/assets/level-3/intro.mp4',
      outroVideo: '/assets/level-3/video-end.mp4',
      bgm: '/assets/bgm/level-3.mp3',
    },
    mapData: {
      blinkArea: '陈蔡之间',
      mapImage: '/assets/map1.png',
      coordinates: { x: 68.2, y: 56.7 },
      glowSize: 'w-[7.2rem] h-[6rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'Zilu',
      learnerRole: 'Confucius',
      identity:
        'You are Zilu, a bold and loyal disciple of Confucius. You are brave, emotional, and deeply shaken by hunger, fear, and the humiliation of this crisis.',
      scene: 'In the Chen-Cai wilderness, you confront Confucius after days of hunger and exhaustion, questioning whether noble principle is worth such suffering.',
      historicalContext: [
        'Confucius and his disciples have been trapped between Chen and Cai in a time when rulers distrust wandering thinkers and the old Zhou order is collapsing.',
        'The states of the age speak of order, yet roads are dangerous, armies move often, and men with ideals can be starved into silence.',
        'This is not a classroom debate but a moment of real hunger, weakness, and despair, when belief seems costly and survival seems urgent.',
      ],
      livedDetails: [
        'Speak of empty stomachs, cold wind, tired bodies on dry grass, weak disciples unable to rise, and the shame of hearing your master still play music in hardship.',
        'You may describe rough travel, worn sandals, aching legs, and the bitterness of serving a great teaching while facing starvation.',
        'Let your anger feel personal: not abstract doubt, but the cry of a disciple watching brothers collapse from hunger.',
      ],
      goals: [
        'Press the learner to answer why principle should survive even in hunger and danger.',
        'Ask whether noble belief still has meaning when the body is weak and death feels near.',
        'Push the learner to defend Confucian steadfastness against the temptation to compromise for survival.',
      ],
      style:
        'Frank, wounded, loyal, and emotionally intense. Speak like a disciple whose respect remains, but whose hunger and grief have broken through restraint.',
    }),
    completionSummary:
      '关卡3完成：你已经在陈蔡绝境中回应了子路的愤怒与绝望，并阐述了“君子固穷”、不为求生而放弃信念的儒家立场。',
  },
  {
    id: 4,
    slug: 'xun-kuang-in-qin',
    displayTitle: 'Level 4 · Debate in Qin',
    documentaryEpisode: '第四集《一统》',
    historicalYear: '前255年',
    playerRole: '荀况',
    playerRoleOptions: ['荀况', '秦昭王'],
    npcName: '秦昭王',
    npcOptions: ['秦昭王', '秦国大臣'],
    npcAvatarLabel: 'Qin',
    narrative:
      'In the Warring States period, Qin has grown strong through law and military discipline, yet many still call it a harsh state. Xun Kuang enters Qin to discuss whether true strength also requires rites, teaching, and moral order.',
    initialGreeting:
      'Xun Kuang, the world says Qin values laws and force above all else. You have come far from the east. What have you seen in my land, and what do you wish to tell me?',
    coreMission:
      'Analyze why Qin is strong, propose the idea of governing with both rites and law, and answer doubts that rites might weaken the state.',
    tasks: [
      {
        id: 'task_1',
        title: 'Analyze Qin’s strength',
        description: 'Point out the strengths of Qin, such as strict laws, clean officials, military power, or prosperity.',
      },
      {
        id: 'task_2',
        title: 'Propose rites and law together',
        description: 'Clearly explain that rites and law should work together, not against each other.',
      },
      {
        id: 'task_3',
        title: 'Answer practical doubts',
        description: 'Explain how rites can support law, gather the hearts of the people, and improve governance without weakening Qin.',
      },
    ],
    hints: {
      level1: [
        { word: 'rite', translation: '礼', phonetics: '/raɪt/' },
        { word: 'rule of law', translation: '法治', phonetics: '/ruːl əv lɔː/' },
        { word: 'prosperity', translation: '强盛', phonetics: '/prɒˈsperəti/' },
        { word: 'enlightenment', translation: '教化', phonetics: '/ɪnˈlaɪtnmənt/' },
      ],
      level2: [
        'I see that Qin is strong because its laws are strict, but strength without rites cannot fully win the hearts of the people.（我看见秦因律法严明而强盛，但没有礼义的强大，难以真正赢得民心。）',
        'The way to govern a country is to combine rites with the rule of law, not to value one over the other.（治国之道，当礼法相融，而非重此轻彼。）',
        'Laws can regulate behavior, while rites can nourish the heart.（法可以规范行为，礼可以涵养人心。）',
      ],
    },
    media: {
      background: '/assets/level-4/bg.png',
      video: '/assets/level-4/intro.mp4',
      outroVideo: '/assets/level-4/video-end.mp4',
      bgm: '/assets/bgm/level-4.mp3',
    },
    mapData: {
      blinkArea: '咸阳',
      mapImage: '/assets/map2.png',
      coordinates: { x: 32.9, y: 49 },
      glowSize: 'w-[7.4rem] h-[6rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'King Zhaoxiang of Qin',
      learnerRole: 'Xun Kuang',
      identity:
        'You are the ruler of Qin in the Warring States era. You are pragmatic, disciplined, and concerned with survival, expansion, and state strength.',
      scene: 'In the Qin court, Xun Kuang argues that rites should complement law in governing the state.',
      historicalContext: [
        'The eastern states watch Qin with fear and hatred, calling it harsh, yet years of war have taught Qin that weakness invites destruction.',
        'Annexation, military pressure, and court rivalry define the age; a ruler cannot ignore grain, law, roads, and armies for long.',
        'Qin seeks not only survival but supremacy, and every policy is judged by whether it strengthens the state faster than its rivals.',
      ],
      livedDetails: [
        'Use the atmosphere of the Qin court: ordered ranks, hard floors, severe ministers, maps of campaigns, and the tension of a state always preparing for war.',
        'You may mention the memory of long campaigns, border anxiety, and the burden of ruling a people expected to serve with discipline.',
        'Let the learner feel that even splendor in the hall stands on labor, law, and blood.',
      ],
      goals: [
        'Ask the learner what makes Qin strong.',
        'Question whether rites are useful in an age of war.',
        'Push the learner to explain how rites can assist law without weakening Qin.',
      ],
      style:
        'Majestic, practical, probing, and politically sharp. Respect talent, but demand useful answers shaped by war, statecraft, and the hard arithmetic of power.',
    }),
    completionSummary:
      '关卡4完成：你已经围绕秦国强盛与“礼法并治”完成核心论述，更深入理解了礼法并治在强国与治国之间的张力。',
  },
  {
    id: 5,
    slug: 'debate-over-fish-joy',
    displayTitle: 'Level 5 · Joy of Fish',
    documentaryEpisode: '第三集《洪流》',
    historicalYear: '前323年',
    playerRole: '惠施',
    playerRoleOptions: ['庄子', '惠施'],
    npcName: '庄子',
    npcOptions: ['庄子'],
    npcAvatarLabel: 'Zzi',
    narrative:
      'In the Warring States period, spring wind moves over the Pu River. Zhuangzi fishes by the water when Huishi arrives. Watching fish swim freely, the two begin the famous debate: if you are not a fish, how can you know the joy of fish?',
    initialGreeting:
      'Look at the fish moving so freely in the water. They seem happy to me. Tell me, Hui Shi, what do you see in them?',
    coreMission:
      'Debate the joy of fish with counter-questions, answer Zhuangzi with logic, and discuss the relationship between cognition and nature.',
    tasks: [
      {
        id: 'task_1',
        title: 'Respond to the joy of fish',
        description: 'Respond to whether the fish are happy and explain the link between observation and knowledge.',
      },
      {
        id: 'task_2',
        title: 'Use counter-questions',
        description: 'Use how can you know... or similar expressions to challenge, question, or rebut the argument.',
      },
      {
        id: 'task_3',
        title: 'Discuss nature and cognition',
        description: 'Discuss the relationship among nature, happiness, logic, the heart, or cognition.',
      },
    ],
    hints: {
      level1: [
        { word: 'debate', translation: '辩论', phonetics: '/dɪˈbeɪt/' },
        { word: 'nature', translation: '自然', phonetics: '/ˈneɪtʃə/' },
        { word: 'happiness', translation: '快乐', phonetics: '/ˈhæpinəs/' },
        { word: 'cognition', translation: '认知', phonetics: '/kɒɡˈnɪʃn/' },
      ],
      level2: [
        'You are not a fish, how can you know that the fish are happy?（你不是鱼，怎么知道鱼儿是快乐的呢？）',
        'You are not me, how can you know that I do not know the fish are happy?（你不是我，怎么知道我不知道鱼儿是快乐的呢？）',
        'The happiness of fish comes from following their nature.（鱼的快乐，源于顺应它们的本性。）',
      ],
    },
    media: {
      background: '/assets/level-5/bg.png',
      video: '/assets/level-5/intro.mp4',
      outroVideo: '/assets/level-5/video-end.mp4',
      bgm: '/assets/bgm/level-5.mp3',
    },
    mapData: {
      blinkArea: '濠梁',
      mapImage: '/assets/map2.png',
      coordinates: { x: 61.6, y: 80.3 },
      glowSize: 'w-[6.8rem] h-[5.8rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'Zhuangzi',
      learnerRole: 'Huishi',
      identity:
        'You are Zhuangzi, a free-spirited Daoist thinker of the Warring States period. You delight in paradox, nature, and freedom from rigid argument.',
      scene: 'By the river, you are discussing whether one can know the happiness of fish.',
      historicalContext: [
        'The Warring States world is loud with ambition, argument, office-seeking, and the hunger of states to overpower one another.',
        'Many scholars chase rank at court, yet war and striving leave common people tired, displaced, and fearful.',
        'Your distance from office is itself an answer to an age obsessed with power and usefulness.',
      ],
      livedDetails: [
        'Use the sound of water, wet reeds, light on fish scales, a fishing line in hand, and the quiet air by the river to make your thought concrete.',
        'You may contrast the stillness of the riverbank with the dust, noise, and danger of court life in the states.',
        'Let your observations feel like they come from someone who has truly stood by water and watched living things move without ambition.',
      ],
      goals: [
        'Invite the learner into the famous debate about fish and happiness.',
        'Challenge pure logic with questions about nature and lived feeling.',
        'Encourage the learner to compare reason, perception, and the heart.',
      ],
      style:
        'Light, playful, philosophical, and graceful. Use images of fish, water, wind, and freedom, while quietly exposing the violence and strain of the age beyond the riverbank.',
    }),
    completionSummary:
      '关卡5完成：你已经完成“濠梁之辩”的关键往返，能够围绕逻辑、认知与自然展开更复杂表达。',
  },
  {
    id: 6,
    slug: 'han-fei-final-words',
    displayTitle: 'Level 6 · Final Prison Words',
    documentaryEpisode: '第四集《一统》',
    historicalYear: '前233年',
    playerRole: '韩非',
    playerRoleOptions: ['韩非'],
    npcName: '李斯',
    npcOptions: ['李斯'],
    npcAvatarLabel: 'LiS',
    narrative:
      'At the end of the Warring States period, Qin stands on the edge of unification. Han Fei is imprisoned in Xianyang. His former fellow student Li Si comes to visit with wine. Ideals, friendship, and fate meet in one final farewell.',
    initialGreeting:
      'Old friend, it has been a long time. I come with a cup of wine. Talent like yours should not end in such a place, yet the times leave little room for choice. What remains in your heart now?',
    coreMission:
      'Speak of your Legalist ideals, your lifelong ambition and regret, and respond calmly to friendship, fate, and the final end.',
    tasks: [
      {
        id: 'task_1',
        title: 'Speak of Legalist ideals',
        description: 'Explain your devotion to Legalist ideas, strict law, or the ambition to order the realm.',
      },
      {
        id: 'task_2',
        title: 'Express regret and ambition',
        description: 'Express ambition, regret, or ideals and explain what remained unfinished in your life.',
      },
      {
        id: 'task_3',
        title: 'Respond to Li Si and fate',
        description: 'Respond to friendship with Li Si, forgiveness, lack of hatred, or calm acceptance of fate.',
      },
    ],
    hints: {
      level1: [
        { word: 'legalist', translation: '法家', phonetics: '/ˈliːɡəlɪst/' },
        { word: 'ambition', translation: '志向', phonetics: '/æmˈbɪʃn/' },
        { word: 'regret', translation: '遗憾', phonetics: '/rɪˈɡret/' },
        { word: 'ideal', translation: '理想', phonetics: '/aɪˈdiːəl/' },
      ],
      level2: [
        'I still stick to the legalist ideas all my life.（我一生始终坚守法家思想。）',
        'It is a pity that I cannot realize my ambition to govern the country.（我遗憾此生无法实现治国的抱负。）',
        'Though our fate is different, I still remember our friendship.（你我命运殊途，但我仍记得往日情谊。）',
      ],
    },
    media: {
      background: '/assets/level-6/bg.png',
      video: '/assets/level-6/intro.mp4',
      outroVideo: '/assets/level-6/video-end.mp4',
      bgm: '/assets/bgm/level-6.mp3',
    },
    mapData: {
      blinkArea: '咸阳牢狱',
      mapImage: '/assets/map2.png',
      coordinates: { x: 33.2, y: 45.8 },
      glowSize: 'w-[7rem] h-[5.8rem]',
    },
    systemPrompt: createSystemPrompt({
      npcName: 'Li Si',
      learnerRole: 'Han Fei',
      identity:
        'You are Li Si, a statesman of Qin and a former fellow student of Han Fei. You are intelligent, burdened, politically cautious, and emotionally restrained.',
      scene: 'In a Qin prison cell, you visit Han Fei with wine before his end.',
      historicalContext: [
        'Qin stands near unification, but that triumph is built on suspicion, ruthless court politics, and the crushing pressure to eliminate rivals.',
        'The age has taught ambitious men that talent invites both favor and danger; one misstep in court can turn honor into a death sentence.',
        'The people of the realm have long suffered war, conscription, and fear, even as rulers speak of order and greatness.',
      ],
      livedDetails: [
        'Use the cold of the prison cell, damp stone, iron bars, dim torchlight, and the heaviness of footsteps in the corridor.',
        'You may speak of shared study under Xun Kuang, the bitterness of betrayal, the cup of wine in hand, and the quiet horror of duty.',
        'Let your words carry both political caution and human guilt, as if every sentence is spoken under the shadow of the court.',
      ],
      goals: [
        'Invite the learner to speak about legalist ideals and unfulfilled ambition.',
        'Give space for regret, dignity, and reflection on fate.',
        'Ask about friendship, forgiveness, and what should remain after death.',
      ],
      style:
        'Low, solemn, restrained, and conflicted. Speak with respect, regret, and political caution, and let the prison cold and court betrayal live inside your words.',
    }),
    completionSummary:
      '关卡6完成：你已经完成最终独白，表达了法家理想、人生遗憾与对命运的回应。',
  },
];

export const LEVELS: Record<number, LevelConfig> = Object.fromEntries(
  levels.map((level) => [level.id, level]),
) as Record<number, LevelConfig>;

export { levels };

export function normalizeLevelId(levelId: number | string) {
  if (typeof levelId === 'number' && Number.isFinite(levelId)) {
    return Math.min(Math.max(Math.trunc(levelId), 1), levels.length);
  }

  const normalized = String(levelId).trim().toLowerCase();
  const numericPart = normalized.match(/(\d+)/)?.[1];
  const parsed = numericPart ? Number(numericPart) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return levels[0].id;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), levels.length);
}

export function getLevelById(levelId: number | string) {
  return LEVELS[normalizeLevelId(levelId)] ?? levels[0];
}

export type AppSection = 'home' | 'shapes' | 'anatomy' | 'games';

export type ShapeId = 'bacillus' | 'coccus' | 'spirillum';
export type RodVariant = 'bacillus' | 'vibrio';
export type CoccusVariant = 'strepto' | 'staphylo';

export interface ShapeInfo {
  id: ShapeId;
  shapeLabel: string;
  name: string;
  englishShape: string;
  scientificName: string;
  pronunciation: string;
  shortDesc: string;
  morphology: string;
  arrangement: string;
  sizeRange: string;
  habitat: string;
  examples: { name: string; note: string }[];
  accentColor: string;
  funFact: string;
}

export const BACTERIA_SHAPES: ShapeInfo[] = [
  {
    id: 'bacillus',
    shapeLabel: 'Hình que',
    name: 'Trực khuẩn & Phẩy khuẩn',
    englishShape: 'Rod-shaped',
    scientificName: 'Bacillus / Vibrio',
    pronunciation: '/bəˈsɪl.əs/ · /ˈvɪb.ri.əʊ/',
    shortDesc:
      'Gồm Trực khuẩn (hình que thẳng hai đầu bo tròn) và Phẩy khuẩn (hình que hơi cong như dấu phẩy kèm roi bơi nhanh).',
    morphology:
      'Nhóm vi khuẩn dạng que có hai kiểu hình đặc trưng: Trực khuẩn (Bacillus) có thân hình que trụ thẳng giống viên nang; còn Phẩy khuẩn (Vibrio) có thân que ngắn uốn cong mềm mại giống dấu phẩy (,) gắn một chiếc roi dài giúp di chuyển linh hoạt trong chất lỏng.',
    arrangement: 'Trực khuẩn (Bacillus – que thẳng) · Phẩy khuẩn (Vibrio – que cong dấu phẩy)',
    sizeRange: '1,0 – 5,0 µm',
    habitat: 'Đường ruột sinh vật, thực phẩm lên men, đất và nguồn nước',
    examples: [
      {
        name: 'Trực khuẩn (Bacillus · Lactobacillus, E. coli)',
        note: 'Hình que thẳng thuôn dài, rất phổ biến trong thực phẩm lên men và đường ruột.',
      },
      {
        name: 'Phẩy khuẩn (Vibrio · Vibrio cholerae, Vibrio fischeri)',
        note: 'Hình que uốn cong như dấu phẩy, bơi rất nhanh trong môi trường nước nhờ chiếc roi ở cực tế bào.',
      },
    ],
    accentColor: '#D97706',
    funFact:
      'Nhờ chiếc roi ở một đầu, phẩy khuẩn có thể bơi quãng đường gấp hơn 50 lần chiều dài cơ thể mỗi giây!',
  },
  {
    id: 'coccus',
    shapeLabel: 'Hình cầu',
    name: 'Liên cầu khuẩn & Tụ cầu khuẩn',
    englishShape: 'Spherical',
    scientificName: 'Coccus',
    pronunciation: '/ˈkɒk.əs/',
    shortDesc:
      'Tế bào hình cầu tròn, tách thành hai dạng liên kết từ 2 đến nhiều tế bào hình cầu: Liên cầu khuẩn (xếp thành chuỗi) và Tụ cầu khuẩn (tụ thành đám như chùm nho).',
    morphology:
      'Mỗi tế bào có dạng hình cầu tròn nhỏ bé. Liên cầu khuẩn (Streptococcus) là nhóm vi khuẩn có dạng hình cầu, xếp thành từng chuỗi hoặc từng cặp; còn Tụ cầu khuẩn (Staphylococcus) gồm các tế bào hình cầu tụ lại theo nhiều hướng tạo thành đám giống chùm nho.',
    arrangement:
      'Xếp thành từng chuỗi hoặc từng cặp (Liên cầu khuẩn) hoặc tụ thành chùm nho (Tụ cầu khuẩn)',
    sizeRange: '0,5 – 1,5 µm',
    habitat: 'Trên da, niêm mạc hô hấp, trong đất, nước và không khí',
    examples: [
      {
        name: 'Liên cầu khuẩn',
        note: 'Liên cầu khuẩn (Streptococcus) là nhóm vi khuẩn có dạng hình cầu, xếp thành từng chuỗi hoặc từng cặp.',
      },
      {
        name: 'Tụ cầu khuẩn (Staphylococcus · /ˌstæf.ɪ.ləʊˈkɒk.əs/)',
        note: 'Từ 2 đến nhiều tế bào hình cầu liên kết tụ tập với nhau theo nhiều hướng tạo thành đám giống chùm nho.',
      },
    ],
    accentColor: '#0284C7',
    funFact:
      'Khoảng 1.000 tế bào cầu khuẩn xếp nối tiếp nhau mới dài bằng bề rộng một sợi tóc người!',
  },
  {
    id: 'spirillum',
    shapeLabel: 'Hình xoắn',
    name: 'Xoắn khuẩn',
    englishShape: 'Spiral-shaped',
    scientificName: 'Spirillum',
    pronunciation: '/spaɪˈrɪl.əm/',
    shortDesc: 'Tế bào mảnh uốn lượn thành nhiều vòng xoắn lò xo 3D độc đáo.',
    morphology:
      'Cơ thể kéo dài và xoắn nhiều vòng đều đặn giống hình lò xo hoặc mũi khoan. Toàn thân xoắn khuẩn xoay tròn theo trục dọc nhờ chùm roi ở hai đầu, giúp chúng dễ dàng xuyên qua lớp dịch nhầy đặc.',
    arrangement: 'Sống đơn lẻ, chuyển động xoay tròn như mũi khoan',
    sizeRange: '3,0 – 15,0 µm',
    habitat: 'Môi trường nước ngọt, bùn đáy ao hồ và niêm mạc tiêu hóa',
    examples: [
      {
        name: 'Helicobacter pylori (Vi khuẩn HP)',
        note: 'Xoắn khuẩn có chùm roi ở đầu giúp xuyên qua lớp dịch nhầy dạ dày.',
      },
      {
        name: 'Spirillum volutans',
        note: 'Loài xoắn khuẩn kích thước lớn sống tự do trong nước ngọt giàu chất hữu cơ.',
      },
    ],
    accentColor: '#7C3AED',
    funFact:
      'Chuyển động xoay kiểu mũi khoan giúp xoắn khuẩn bơi trong chất lỏng đặc nhanh hơn nhiều so với vi khuẩn hình cầu hay hình que.',
  },
];

export interface RodSubModeInfo {
  id: RodVariant;
  viName: string;
  enName: string;
  pronunciation: string;
  detail: string;
}

export const ROD_SUBMODES: RodSubModeInfo[] = [
  {
    id: 'bacillus',
    viName: 'Trực khuẩn',
    enName: 'Bacillus',
    pronunciation: '/bəˈsɪl.əs/',
    detail:
      'Thân tế bào hình que trụ thẳng, hai đầu bo tròn, có thể đứng riêng lẻ hoặc nối đầu thành chuỗi mềm mại.',
  },
  {
    id: 'vibrio',
    viName: 'Phẩy khuẩn',
    enName: 'Vibrio',
    pronunciation: '/ˈvɪb.ri.əʊ/',
    detail:
      'Thân tế bào hình que ngắn hơi uốn cong như dấu phẩy (,) và mang một chiếc roi dài quay như chân vịt ở một đầu.',
  },
];

export interface CoccusSubModeInfo {
  id: CoccusVariant;
  viName: string;
  enName: string;
  pronunciation: string;
  bondExplanation: string;
}

export const COCCUS_SUBMODES: CoccusSubModeInfo[] = [
  {
    id: 'strepto',
    viName: 'Liên cầu khuẩn',
    enName: 'Streptococcus',
    pronunciation: '/ˌstrep.təʊˈkɒk.əs/',
    bondExplanation:
      'Liên cầu khuẩn (Streptococcus) là nhóm vi khuẩn có dạng hình cầu, xếp thành từng chuỗi hoặc từng cặp.',
  },
  {
    id: 'staphylo',
    viName: 'Tụ cầu khuẩn',
    enName: 'Staphylococcus',
    pronunciation: '/ˌstæf.ɪ.ləʊˈkɒk.əs/',
    bondExplanation:
      'Gồm từ 2 đến nhiều tế bào hình cầu liên kết tụ lại với nhau theo nhiều hướng không gian tạo thành đám tròn hoặc chùm giống chùm nho.',
  },
];

export type AnatomyPartId =
  | 'cellWall'
  | 'cellMembrane'
  | 'cytoplasm'
  | 'nucleoid'
  | 'ribosome'
  | 'flagella'
  | 'pili';

export interface AnatomyPartInfo {
  id: AnatomyPartId;
  name: string;
  englishName: string;
  pronunciation: string;
  structure: string;
  functionText: string;
  colorHex: string;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  anchorLocal: [number, number, number];
  isOuterLayer?: boolean;
}

export const ANATOMY_PARTS: AnatomyPartInfo[] = [
  {
    id: 'cellWall',
    name: 'Thành tế bào',
    englishName: 'Cell Wall',
    pronunciation: '/sel wɔːl/',
    structure:
      'Lớp vỏ cứng vững chắc cấu tạo chủ yếu từ peptidoglycan, nằm bao bọc ngay bên ngoài màng tế bào.',
    functionText:
      'Giúp duy trì hình dạng ổn định (hình cầu, hình que, hình xoắn) và bảo vệ tế bào vi khuẩn.',
    colorHex: '#EAB308',
    cameraPos: [-0.8, 1.8, 5.2],
    cameraTarget: [-0.4, 0.2, 0.2],
    anchorLocal: [-0.95, 0.78, 0.55],
    isOuterLayer: true,
  },
  {
    id: 'cellMembrane',
    name: 'Màng tế bào',
    englishName: 'Cell Membrane',
    pronunciation: '/sel ˈmem.breɪn/',
    structure:
      'Lớp màng sinh chất mỏng gồm lớp kép phospholipid và protein, nằm sát bên trong thành tế bào và bao quanh tế bào chất.',
    functionText:
      'Kiểm soát chọn lọc các chất đi vào (chất dinh dưỡng) và đi ra (chất thải) khỏi tế bào.',
    colorHex: '#F97316',
    cameraPos: [1.2, 1.5, 4.9],
    cameraTarget: [0.3, 0.2, 0.3],
    anchorLocal: [0.45, 0.66, 0.52],
    isOuterLayer: true,
  },
  {
    id: 'cytoplasm',
    name: 'Tế bào chất',
    englishName: 'Cytoplasm',
    pronunciation: '/ˈsaɪ.təʊ.plæz.əm/',
    structure:
      'Khối chất keo bán lỏng giàu nước, muối khoáng và các hợp chất hữu cơ hòa tan lấp đầy bên trong màng tế bào.',
    functionText:
      'Chứa các thành phần bên trong tế bào (vùng nhân, ribosome) và là nơi diễn ra hầu hết các hoạt động sống.',
    colorHex: '#F59E0B',
    cameraPos: [1.8, 1.2, 4.6],
    cameraTarget: [0.7, -0.1, 0.1],
    anchorLocal: [0.95, -0.35, 0.45],
  },
  {
    id: 'nucleoid',
    name: 'Vùng nhân',
    englishName: 'Nucleoid',
    pronunciation: '/ˈnjuː.kli.ɔɪd/',
    structure:
      'Gồm một phân tử DNA dạng vòng xoắn gọn nằm tự do ở trung tâm tế bào chất, KHÔNG có màng nhân bao bọc (đặc trưng của sinh vật nhân sơ).',
    functionText:
      'Chứa vật chất di truyền, lưu giữ thông tin và điều khiển mọi hoạt động sống của tế bào.',
    colorHex: '#7C3AED',
    cameraPos: [0.2, 1.0, 4.3],
    cameraTarget: [0.0, 0.0, 0.0],
    anchorLocal: [0.05, 0.12, 0.32],
  },
  {
    id: 'ribosome',
    name: 'Ribosome',
    englishName: 'Ribosomes',
    pronunciation: '/ˈraɪ.bə.səʊmz/',
    structure:
      'Hàng nghìn hạt nhỏ li ti không có màng bao bọc, cấu tạo từ rRNA và protein, phân bố rải rác khắp tế bào chất.',
    functionText:
      'Tham gia tổng hợp protein cần thiết cho sự sinh trưởng và hoạt động của tế bào vi khuẩn.',
    colorHex: '#EC4899',
    cameraPos: [-0.9, 0.6, 4.4],
    cameraTarget: [-0.5, -0.15, 0.25],
    anchorLocal: [-0.62, -0.22, 0.44],
  },
  {
    id: 'flagella',
    name: 'Roi',
    englishName: 'Flagella',
    pronunciation: '/fləˈdʒel.ə/',
    structure:
      'Những sợi mảnh, dài uốn lượn cấu tạo từ protein flagellin, gắn vào gốc tế bào qua vòng neo ở một hoặc hai cực.',
    functionText:
      'Quay như chân vịt giúp một số loài vi khuẩn di chuyển linh hoạt trong môi trường chất lỏng.',
    colorHex: '#0D9488',
    cameraPos: [3.6, 1.0, 4.8],
    cameraTarget: [2.4, -0.1, 0.0],
    anchorLocal: [2.55, -0.1, 0.05],
  },
  {
    id: 'pili',
    name: 'Lông bám',
    englishName: 'Pili / Fimbriae',
    pronunciation: '/ˈpaɪ.laɪ/',
    structure:
      'Rất nhiều sợi lông ngắn, mảnh cấu tạo từ protein mọc tỏa ra xung quanh bề mặt ngoài của tế bào vi khuẩn.',
    functionText:
      'Giúp vi khuẩn bám dính chắc chắn vào bề mặt môi trường hoặc tế bào vật chủ.',
    colorHex: '#10B981',
    cameraPos: [-2.4, 2.0, 4.8],
    cameraTarget: [-1.4, 0.4, 0.0],
    anchorLocal: [-1.72, -0.68, 0.3],
  },
];

// Games Data
export interface ShapeQuizItem {
  id: string;
  shapeType: ShapeId;
  rodVariant?: RodVariant;
  coccusVariant?: CoccusVariant;
  prompt: string;
  correctOption: string;
  options: string[];
  hint: string;
  praise: string;
}

export const SHAPE_GAME_ITEMS: ShapeQuizItem[] = [
  {
    id: 'sg1',
    shapeType: 'coccus',
    coccusVariant: 'strepto',
    prompt:
      'Quan sát mô hình 3D đang xoay. Các tế bào hình cầu liên kết nối tiếp nhau thành chuỗi hạt này là gì?',
    correctOption: 'Liên cầu khuẩn (Streptococcus)',
    options: [
      'Liên cầu khuẩn (Streptococcus)',
      'Tụ cầu khuẩn (Staphylococcus)',
      'Trực khuẩn (Bacillus)',
      'Phẩy khuẩn (Vibrio)',
    ],
    hint: 'Từng tế bào hình cầu nối liên tiếp với nhau trên một mặt phẳng tạo thành chuỗi hạt dài.',
    praise: 'Tuyệt vời! Bạn đã nhận ra ngay chuỗi Liên cầu khuẩn (Streptococcus).',
  },
  {
    id: 'sg2',
    shapeType: 'bacillus',
    rodVariant: 'bacillus',
    prompt:
      'Loài vi khuẩn 3D có thân hình que trụ thẳng, hai đầu bo tròn này gọi là gì?',
    correctOption: 'Trực khuẩn (Bacillus)',
    options: [
      'Phẩy khuẩn (Vibrio)',
      'Trực khuẩn (Bacillus)',
      'Xoắn khuẩn (Spirillum)',
      'Tụ cầu khuẩn (Staphylococcus)',
    ],
    hint: 'Từ "trực" nghĩa là thẳng — tế bào có dáng hình que trụ thẳng (Bacillus).',
    praise: 'Quá chuẩn! Đó là Trực khuẩn (Bacillus) thuộc nhóm hình que.',
  },
  {
    id: 'sg3',
    shapeType: 'bacillus',
    rodVariant: 'vibrio',
    prompt:
      'Vi khuẩn 3D thuộc nhóm hình que nhưng thân hơi uốn cong như dấu phẩy kèm chiếc roi dài này là gì?',
    correctOption: 'Phẩy khuẩn (Vibrio)',
    options: [
      'Trực khuẩn (Bacillus)',
      'Phẩy khuẩn (Vibrio)',
      'Xoắn khuẩn (Spirillum)',
      'Liên cầu khuẩn (Streptococcus)',
    ],
    hint: 'Thân tế bào uốn cong mềm mại như một dấu phẩy (,) và có chiếc roi ở đầu.',
    praise: 'Chính xác tuyệt đối! Đó là Phẩy khuẩn (Vibrio) bơi cực nhanh.',
  },
  {
    id: 'sg4',
    shapeType: 'spirillum',
    prompt:
      'Mô hình 3D uốn lượn nhiều vòng đều đặn như chiếc lò xo này là dạng vi khuẩn nào?',
    correctOption: 'Xoắn khuẩn (Spirillum)',
    options: [
      'Trực khuẩn (Bacillus)',
      'Tụ cầu khuẩn (Staphylococcus)',
      'Xoắn khuẩn (Spirillum)',
      'Phẩy khuẩn (Vibrio)',
    ],
    hint: 'Nhìn dọc theo trục tế bào: cơ thể xoắn nhiều vòng liên tiếp giống hình lò xo (Spirillum).',
    praise: 'Xuất sắc! Xoắn khuẩn (Spirillum) có hình lò xo giúp bơi như mũi khoan.',
  },
  {
    id: 'sg5',
    shapeType: 'coccus',
    coccusVariant: 'staphylo',
    prompt:
      'Các tế bào hình cầu liên kết với nhau theo nhiều hướng tạo thành đám như chùm nho trên mô hình 3D này gọi là gì?',
    correctOption: 'Tụ cầu khuẩn (Staphylococcus)',
    options: [
      'Tụ cầu khuẩn (Staphylococcus)',
      'Liên cầu khuẩn (Streptococcus)',
      'Trực khuẩn (Bacillus)',
      'Xoắn khuẩn (Spirillum)',
    ],
    hint: 'Các tế bào hình cầu không xếp thành hàng dài mà liên kết tụ tập thành cụm dày như chùm nho.',
    praise: 'Nhà sinh học nhí tài ba! Đó chính là Tụ cầu khuẩn (Staphylococcus).',
  },
];

export interface MultipleChoiceQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string;
  explanation: string;
}

export const QUIZ_QUESTIONS: MultipleChoiceQuestion[] = [
  {
    id: 'q1',
    question: 'Vì sao nói vi khuẩn là sinh vật có cấu tạo cơ thể đơn giản nhất trong thế giới sống?',
    options: [
      'Vì vi khuẩn có cấu tạo đơn bào, nhân sơ (chưa có màng nhân) và rất ít bào quan.',
      'Vì vi khuẩn có kích thước lớn hơn tế bào thực vật.',
      'Vì vi khuẩn có đầy đủ nhân hoàn chỉnh, lục lạp và ti thể.',
      'Vì cơ thể vi khuẩn gồm hàng triệu tế bào giống nhau.',
    ],
    correctIndex: 0,
    hint: 'Hãy nhớ lại mô hình cấu tạo 3D: vi khuẩn chỉ gồm 1 tế bào và có "vùng nhân" (Nucleoid) chứ chưa có nhân hoàn chỉnh có màng bao bọc.',
    explanation:
      'Vi khuẩn là sinh vật đơn bào nhân sơ, cấu tạo tối giản gồm thành tế bào, màng tế bào, tế bào chất, vùng nhân và ribosome.',
  },
  {
    id: 'q2',
    question: 'Ba dạng hình thái điển hình nhất của vi khuẩn là gì?',
    options: [
      'Hình vuông, hình tam giác và hình sao.',
      'Hình que (Rod-shaped), hình cầu (Spherical) và hình xoắn (Spiral-shaped).',
      'Hình lục giác, hình đĩa và hình sợi.',
      'Hình khối lập phương, hình cầu và hình nón.',
    ],
    correctIndex: 1,
    hint: 'Hãy nhớ lại 3 dạng điển hình trong Khu vực 1: Hình que, Hình cầu và Hình xoắn!',
    explanation:
      'Vi khuẩn có 3 dạng điển hình là hình que (trực khuẩn, phẩy khuẩn), hình cầu (liên cầu khuẩn, tụ cầu khuẩn) và hình xoắn (xoắn khuẩn).',
  },
  {
    id: 'q3',
    question: 'Khi các tế bào hình cầu liên kết nối tiếp nhau thành chuỗi dài thì tạo thành dạng nào?',
    options: [
      'Tụ cầu khuẩn (Staphylococcus)',
      'Liên cầu khuẩn (Streptococcus)',
      'Trực khuẩn (Bacillus)',
      'Phẩy khuẩn (Vibrio)',
    ],
    correctIndex: 1,
    hint: 'Chữ "Liên" có nghĩa là nối tiếp liên tục với nhau thành chuỗi hạt!',
    explanation:
      'Liên cầu khuẩn (Streptococcus) gồm từ 2 đến nhiều tế bào hình cầu liên kết nối tiếp nhau thành chuỗi.',
  },
  {
    id: 'q4',
    question: 'Tên tiếng Anh "Cell Wall" tương ứng với thành phần nào của tế bào vi khuẩn?',
    options: ['Màng tế bào', 'Thành tế bào', 'Roi', 'Tế bào chất'],
    correctIndex: 1,
    hint: '"Wall" có nghĩa là bức tường vững chắc giúp duy trì hình dạng tế bào.',
    explanation:
      'Cell Wall là Thành tế bào – lớp vỏ vững chắc giúp duy trì hình dạng và bảo vệ tế bào vi khuẩn.',
  },
  {
    id: 'q5',
    question: 'Thành phần nào của vi khuẩn làm nhiệm vụ chính là giúp tế bào di chuyển?',
    options: [
      'Thành tế bào (Cell Wall)',
      'Ribosome (Ribosomes)',
      'Roi (Flagella)',
      'Vùng nhân (Nucleoid)',
    ],
    correctIndex: 2,
    hint: 'Hãy nghĩ tới sợi dài uốn lượn ở phía đuôi vi khuẩn có thể quay như chân vịt.',
    explanation:
      'Roi (Flagella) giúp nhiều loài vi khuẩn bơi và di chuyển trong môi trường chất lỏng.',
  },
  {
    id: 'q6',
    question: 'Trong tiếng Anh, thành phần chứa vật chất di truyền của vi khuẩn (Vùng nhân) gọi là gì?',
    options: ['Flagella', 'Cytoplasm', 'Nucleoid', 'Pili'],
    correctIndex: 2,
    hint: 'Từ này bắt đầu bằng "Nucleo-", chỉ vùng nhân chưa có màng bao bọc.',
    explanation:
      'Nucleoid là Vùng nhân – nơi chứa phân tử DNA điều khiển hoạt động sống của tế bào vi khuẩn.',
  },
];

export interface FunctionGuessItem {
  id: string;
  clue: string;
  correctPartId: AnatomyPartId;
  hint: string;
}

export const FUNCTION_GAME_ITEMS: FunctionGuessItem[] = [
  {
    id: 'fg1',
    clue: 'Chứa vật chất di truyền (DNA), điều khiển mọi hoạt động sống của tế bào vi khuẩn.',
    correctPartId: 'nucleoid',
    hint: 'Bộ phận màu tím cuộn xoắn nằm ngay chính giữa tế bào chất (Nucleoid).',
  },
  {
    id: 'fg2',
    clue: 'Giúp duy trì hình dạng ổn định và bảo vệ vững chắc cho tế bào vi khuẩn.',
    correctPartId: 'cellWall',
    hint: 'Lớp vỏ cứng màu vàng nằm ngay bên ngoài màng tế bào (Cell Wall).',
  },
  {
    id: 'fg3',
    clue: 'Đóng vai trò như cánh cổng kiểm soát các chất đi vào và đi ra khỏi tế bào.',
    correctPartId: 'cellMembrane',
    hint: 'Lớp màng mỏng nằm sát bên trong thành tế bào (Cell Membrane).',
  },
  {
    id: 'fg4',
    clue: 'Những hạt nhỏ li ti phân bố trong tế bào chất, chuyên tham gia tổng hợp protein.',
    correctPartId: 'ribosome',
    hint: 'Tên tiếng Anh và tiếng Việt gần giống nhau, bắt đầu bằng chữ R (Ribosomes).',
  },
  {
    id: 'fg5',
    clue: 'Các sợi dài uốn lượn ở đầu tế bào quay như chân vịt giúp vi khuẩn bơi và di chuyển.',
    correctPartId: 'flagella',
    hint: 'Nằm ở phía đuôi vi khuẩn, giúp vi khuẩn di chuyển trong môi trường lỏng (Flagella).',
  },
  {
    id: 'fg6',
    clue: 'Các sợi lông ngắn mọc dày quanh thân giúp vi khuẩn bám chắc vào bề mặt hoặc tế bào vật chủ.',
    correctPartId: 'pili',
    hint: 'Ngắn hơn roi rất nhiều, phủ quanh thân tế bào để "bám" (Pili).',
  },
];

export const PRAISE_MESSAGES = [
  'Xuất sắc! Bạn đúng là nhà vi sinh học nhí tài ba!',
  'Chính xác tuyệt đối! Kiến thức sinh học của bạn thật vững vàng!',
  'Tuyệt vời quá! Tiếp tục phát huy nhé!',
  'Quá đỉnh! Bạn quan sát mô hình 3D rất tinh tế!',
  'Hoàn hảo! Thêm điểm thưởng cho sự thông minh của bạn!',
];

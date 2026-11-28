import {
  getCustomComponentsSnapshot,
  isBuiltInVariantDeleted,
} from './customComponentStore';
import { VectorCategory } from './customComponentTypes';
import {
  DynamicSceneMotif,
  DynamicSceneSpec,
  IllustrationPropData,
  IllustrationSceneIcon,
  IllustrationVariant,
} from './types';

export type { VectorCategory };

export interface VectorComponentMeta {
  variant: IllustrationVariant;
  category: VectorCategory;
  label: string;
  description: string;
  keywords: RegExp;
  defaultIcon: IllustrationSceneIcon;
}

export const SCENE_ICON_KEYWORDS: Array<{
  icon: IllustrationSceneIcon;
  label: string;
  keywords: RegExp;
}> = [
  { icon: 'airplane', label: 'Máy bay / Sân bay', keywords: /\b(airport|flight|plane|airplane|boarding|fly|airline|gate|ticket)\b/i },
  { icon: 'luggage', label: 'Hành lý / Du lịch', keywords: /\b(luggage|suitcase|baggage|pack|passport|customs|trip|vacation)\b/i },
  { icon: 'menu', label: 'Thực đơn / Nhà hàng', keywords: /\b(menu|restaurant|waiter|waitress|order|table|bill|check please|dinner|lunch|breakfast|dish|food)\b/i },
  { icon: 'cup', label: 'Đồ uống / Cà phê / Nước', keywords: /\b(coffee|latte|espresso|tea|water|drink|cup|thirsty|juice)\b/i },
  { icon: 'shopping-bag', label: 'Mua sắm / Cửa hàng', keywords: /\b(shop|shopping|store|mall|buy|buying|fitting room|try on|size|shirt|shoes|clothes)\b/i },
  { icon: 'price-tag', label: 'Giá cả / Giảm giá', keywords: /\b(price|cost|discount|sale|cheap|expensive|dollar|pay|receipt|refund)\b/i },
  { icon: 'stethoscope', label: 'Sức khỏe / Bác sĩ', keywords: /\b(doctor|clinic|hospital|sick|headache|fever|medicine|pharmacy|health|symptom|appointment)\b/i },
  { icon: 'sun', label: 'Trời nắng / Thời tiết', keywords: /\b(sunny|sun|hot|warm|weather|forecast|bright|summer|shine)\b/i },
  { icon: 'umbrella', label: 'Ô dù / Che mưa', keywords: /\b(umbrella|raincoat)\b/i },
  { icon: 'rain', label: 'Trời mưa / Bão', keywords: /\b(rain|rainy|storm|wet|shower|pouring|drizzle)\b/i },
  { icon: 'snowflake', label: 'Lạnh / Tuyết', keywords: /\b(cold|freezing|snow|winter|ice|chilly|frost)\b/i },
  { icon: 'book', label: 'Sách / Đọc hiểu', keywords: /\b(book|read|reading|chapter|novel|library|dictionary|vocabulary)\b/i },
  { icon: 'pencil', label: 'Viết / Ghi chú', keywords: /\b(write|writing|pen|pencil|note|homework|essay|spell)\b/i },
  { icon: 'graduation', label: 'Học tập / Kỳ thi', keywords: /\b(exam|test|school|university|student|graduate|degree|lesson|class|teacher)\b/i },
  { icon: 'laptop', label: 'Máy tính / Online', keywords: /\b(laptop|computer|email|online|zoom|website|code|keyboard|type)\b/i },
  { icon: 'calendar', label: 'Lịch hẹn / Ngày', keywords: /\b(calendar|monday|tuesday|wednesday|thursday|friday|saturday|sunday|schedule|date|appointment|weekend)\b/i },
  { icon: 'briefcase', label: 'Công việc / Sếp', keywords: /\b(boss|manager|office|work|job|career|meeting|colleague|client|salary|deadline)\b/i },
  { icon: 'clock', label: 'Đồng hồ / Giờ giấc', keywords: /\b(\d{1,2}:\d{2}|clock|o'clock|hour|minute|early|late|on time|in time|half past|quarter)\b/i },
  { icon: 'car', label: 'Xe hơi / Lái xe', keywords: /\b(car|drive|driving|taxi|uber|traffic|park|parking|road)\b/i },
  { icon: 'bus', label: 'Xe buýt / Tàu điện', keywords: /\b(bus|train|subway|metro|station|commute|stop|ticket)\b/i },
  { icon: 'home', label: 'Nhà cửa / Sinh hoạt', keywords: /\b(home|house|room|kitchen|bedroom|clean|wake up|sleep|morning routine)\b/i },
  { icon: 'dumbbell', label: 'Thể thao / Gym', keywords: /\b(gym|workout|exercise|fitness|sport|train|strong|muscle|run)\b/i },
  { icon: 'music', label: 'Âm nhạc / Giai điệu', keywords: /\b(music|song|sing|melody|rhythm|intonation|pitch|tone)\b/i },
  { icon: 'mic', label: 'Nói / Phát âm / Mic', keywords: /\b(speak|pronounce|pronunciation|stress|syllable|accent|voice|mic|say|tell)\b/i },
  { icon: 'camera', label: 'Ảnh / Quay video', keywords: /\b(camera|photo|picture|selfie|video|record)\b/i },
  { icon: 'heart', label: 'Cảm xúc / Yêu thích', keywords: /\b(love|like|happy|thrilled|feel|feeling|heart|kind|warm|care)\b/i },
  { icon: 'brain', label: 'Tư duy / Ghi nhớ', keywords: /\b(think|mind|brain|remember|forget|understand|know|learn|smart|memory)\b/i },
  { icon: 'lightning', label: 'Mẹo nhanh / Năng lượng', keywords: /\b(tip|trick|fast|quick|boost|power|instant|shortcut|secret)\b/i },
  { icon: 'scale', label: 'So sánh / Cân bằng', keywords: /\b(compare|versus|vs|difference|polite|rude|formal|casual|balance)\b/i },
  { icon: 'gift', label: 'Quà tặng / Bất ngờ', keywords: /\b(gift|present|birthday|surprise|party)\b/i },
  { icon: 'wallet', label: 'Tiền bạc / Thanh toán', keywords: /\b(money|wallet|cash|card|bank|spend|save)\b/i },
  { icon: 'map-pin', label: 'Địa điểm / Chỉ đường', keywords: /\b(where|location|map|direction|street|turn left|turn right|address|hotel)\b/i },
  { icon: 'globe', label: 'Thế giới / Tiếng Anh', keywords: /\b(world|global|english|native|country|travel|culture|language)\b/i },
  { icon: 'handshake', label: 'Giao tiếp / Thỏa thuận', keywords: /\b(agree|deal|welcome|hello|meet|greeting|polite|respect|thank)\b/i },
  { icon: 'chat', label: 'Hội thoại / Trò chuyện', keywords: /\b(chat|talk|conversation|dialogue|ask|answer|reply)\b/i },
  { icon: 'tv', label: 'Màn hình / TV / Phim', keywords: /\b(tv|television|screen|movie|film|show|netflix|youtube)\b/i },
  { icon: 'glasses', label: 'Kính mắt / Thị lực', keywords: /\b(glasses|eyeglasses|spectacles|vision)\b/i },
  { icon: 'watch', label: 'Quan sát / Xem', keywords: /\b(watch|watching|moving|action|match|game)\b/i },
  { icon: 'eye', label: 'Nhìn / Quan tâm', keywords: /\b(look|see|eye|eyes|notice|sight)\b/i },
  { icon: 'listen', label: 'Nghe / Lắng nghe', keywords: /\b(listen|hear|sound|ear|ears|audio)\b/i },
  { icon: 'walk', label: 'Đi bộ / Di chuyển', keywords: /\b(walk|go|move|step|stair)\b/i },
  { icon: 'phone', label: 'Điện thoại / Nhắn tin', keywords: /\b(phone|call|ring|text|message|sms|app)\b/i },
  { icon: 'sparkles', label: 'Nâng cấp / Tự nhiên', keywords: /\b(natural|native|better|upgrade|amazing|wonderful|brilliant|fluent)\b/i },
];

export const VECTOR_COMPONENT_CATALOG: VectorComponentMeta[] = [
  // ── Life / Real-world @englishpracticing168 scenes ────────────────────────
  {
    variant: 'clock-face',
    category: 'life',
    label: 'Đồng hồ & Giờ giấc',
    description: 'Đồng hồ kim + công thức đọc giờ (past/to)',
    keywords: /\b(\d{1,2}:\d{2}|clock|o'clock|twenty past|half past|quarter)\b/i,
    defaultIcon: 'clock',
  },
  {
    variant: 'coffee-cup',
    category: 'life',
    label: 'Tách cà phê nóng',
    description: 'Order cà phê / latte / espresso tại quán',
    keywords: /(coffee|espresso|latte|cappuccino|コーヒー|カフェ)/i,
    defaultIcon: 'cup',
  },
  {
    variant: 'cafe-water',
    category: 'life',
    label: 'Quán cafe & Ly nước',
    description: 'Cảnh quán nước / gọi đồ uống / salt',
    keywords: /(water|drink|thirsty|salt|cafe|喉が渇|水|カフェ)/i,
    defaultIcon: 'cup',
  },
  {
    variant: 'airport-travel',
    category: 'life',
    label: 'Sân bay & Chuyến bay',
    description: 'Thẻ lên máy bay, cổng bay và vali du lịch',
    keywords: /\b(airport|flight|boarding|gate|passport|luggage|baggage|suitcase|plane|airplane|check in for)\b/i,
    defaultIcon: 'airplane',
  },
  {
    variant: 'restaurant-order',
    category: 'life',
    label: 'Nhà hàng & Thực đơn',
    description: 'Thực đơn món ăn, gọi món và thanh toán hóa đơn',
    keywords: /\b(restaurant|menu|waiter|waitress|order food|bill|check please|appetizer|main course|table for)\b/i,
    defaultIcon: 'menu',
  },
  {
    variant: 'shopping-price',
    category: 'life',
    label: 'Mua sắm & Giá cả',
    description: 'Túi đồ, nhãn giá % giảm giá và thử đồ',
    keywords: /\b(shop|shopping|store|discount|sale|price|how much|fitting room|try it on|receipt|refund|size)\b/i,
    defaultIcon: 'shopping-bag',
  },
  {
    variant: 'doctor-health',
    category: 'life',
    label: 'Bác sĩ & Sức khỏe',
    description: 'Phòng khám, ống nghe và đơn thuốc triệu chứng',
    keywords: /\b(doctor|hospital|clinic|sick|headache|stomachache|fever|cough|medicine|pharmacy|symptom|pain)\b/i,
    defaultIcon: 'stethoscope',
  },
  {
    variant: 'weather-forecast',
    category: 'life',
    label: 'Thời tiết & Nhiệt độ',
    description: 'Mặt trời, mây mưa, tuyết lạnh và nhiệt kế trực quan',
    keywords: /\b(weather|forecast|sunny|rain|raining|freezing|chilly|humid|cloudy|umbrella|temperature|degrees)\b/i,
    defaultIcon: 'sun',
  },
  {
    variant: 'office-work',
    category: 'life',
    label: 'Công sở & Sếp',
    description: 'Màn hình bàn làm việc, lịch thứ 6 và email công việc',
    keywords: /(office|boss|manager|friday|meeting|email|work|coworker|deadline|上司|オフィス|メール|金曜)/i,
    defaultIcon: 'briefcase',
  },
  {
    variant: 'hotel-desk',
    category: 'life',
    label: 'Lễ tân khách sạn',
    description: 'Chuông quầy lễ tân, đặt phòng và nhận chìa khóa',
    keywords: /(hotel|reception|lobby|desk|check-in|room key|reservation|ホテル)/i,
    defaultIcon: 'map-pin',
  },
  {
    variant: 'study-desk',
    category: 'life',
    label: 'Bàn học & Ghi chú',
    description: 'Sách mở, bút đánh dấu và thẻ ghi chú học từ mới',
    keywords: /\b(study|homework|exam|test|school|university|library|notebook|textbook|flashcard|review)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'commute-transport',
    category: 'life',
    label: 'Di chuyển & Giao thông',
    description: 'Tuyến đường xe buýt / tàu điện và điểm dừng trạm',
    keywords: /\b(bus|train|subway|metro|station|taxi|traffic|drive|commute|platform|catch the)\b/i,
    defaultIcon: 'bus',
  },
  {
    variant: 'home-routine',
    category: 'life',
    label: 'Sinh hoạt ở nhà',
    description: 'Ngôi nhà ấm áp & lịch sinh hoạt sáng/tối',
    keywords: /\b(wake up|get up|brush|breakfast|sleep|bedtime|house|apartment|chores|clean the room)\b/i,
    defaultIcon: 'home',
  },
  {
    variant: 'gym-fitness',
    category: 'life',
    label: 'Tập luyện & Gym',
    description: 'Tạ tay thể thao và nhịp độ rèn luyện sức khỏe',
    keywords: /\b(gym|workout|exercise|fitness|jogging|running|stretch|muscle|healthy habit)\b/i,
    defaultIcon: 'dumbbell',
  },
  {
    variant: 'phone-call',
    category: 'life',
    label: 'Gọi điện & Nhắn tin',
    description: 'Màn hình cuộc gọi đến / tin nhắn trò chuyện',
    keywords: /\b(phone|call|ring|hang up|hold on|voicemail|text message|chatting|missed call)\b/i,
    defaultIcon: 'phone',
  },
  {
    variant: 'friends-chat',
    category: 'dialogue',
    label: 'Bạn bè trò chuyện',
    description: 'Hai nhân vật trò chuyện thân mật kèm bóng thoại',
    keywords: /(friend|family|casual|classmate|colleague|hang out|友達|家族|同僚|先生)/i,
    defaultIcon: 'chat',
  },
  {
    variant: 'cartoon-host',
    category: 'dialogue',
    label: 'Nhân vật Hoạt Hình Lip-Sync (@Gimmys)',
    description: 'Nhân vật hoạt hình nét mực dày nhép miệng khớp từng từ và cử động tay mượt',
    keywords: /\b(cartoon|host|mascot|gimmys|lip.?sync|avatar|presenter)\b/i,
    defaultIcon: 'mic',
  },
  {
    variant: 'podcast-studio',
    category: 'dialogue',
    label: 'Podcast Studio (2–3 người + Sóng âm)',
    description: 'Khung phòng thu Podcast với 2–3 nhân vật, huy hiệu người đang nói và sóng âm nhảy theo thời gian',
    keywords: /\b(podcast|interview|host a|host b|guest|two speakers|multi.?speaker|shadowing|discussion)\b/i,
    defaultIcon: 'mic',
  },

  // ── Grammar & Structure @englishpracticing168 infographics ─────────────────
  {
    variant: 'tense-timeline',
    category: 'grammar',
    label: 'Trục thời gian thì (Past / Now / Future)',
    description: 'Đường trục 3 thì Quá khứ - Hiện tại - Tương lai với mốc động',
    keywords: /\b(past tense|present|future|yesterday|tomorrow|already|yet|since|for|ago|used to|will|going to)\b/i,
    defaultIcon: 'calendar',
  },
  {
    variant: 'degree-scale',
    category: 'grammar',
    label: 'Thang cấp độ từ vựng (Very → Extreme)',
    description: 'Thang 3 bậc nâng cấp từ nhạt sang mạnh (e.g. tired → exhausted)',
    keywords: /\b(stop saying|very tired|exhausted|freezing|thrilled|furious|tiny|huge|degree|intense|stronger)\b/i,
    defaultIcon: 'sparkles',
  },
  {
    variant: 'phrasal-split',
    category: 'grammar',
    label: 'Tách cụm động từ (Verb + Particle)',
    description: 'Thẻ ghép Động từ + Giới từ tạo nghĩa mới kèm icon',
    keywords: /\b(phrasal verb|give up|turn on|turn off|put off|look forward|pick up|run out|break down|figure out)\b/i,
    defaultIcon: 'lightning',
  },
  {
    variant: 'idiom-split',
    category: 'vocab',
    label: 'Giải mã thành ngữ (Literal ≠ Meaning)',
    description: 'So sánh nghĩa đen bên trái và nghĩa bóng thực tế bên phải',
    keywords: /\b(idiom|piece of cake|break a leg|under the weather|hit the sack|burn the midnight|mean literally)\b/i,
    defaultIcon: 'brain',
  },
  {
    variant: 'flow-diagram',
    category: 'grammar',
    label: 'Sơ đồ 3 bước / 3 cấp độ',
    description: '3 nút tròn nối mũi tên (Past/Present/Future hoặc Can/Could/May)',
    keywords: /(ladder|stair|step|level|stage|past|present|future|階段|段)/i,
    defaultIcon: 'walk',
  },
  {
    variant: 'gauge-arc',
    category: 'dialogue',
    label: 'Đồng hồ sắc thái (Mood Gauge)',
    description: 'Cung 5 nấc màu đo độ thân thiện/lịch sự với emoji',
    keywords: /(tone|polite|rude|warm|smile|friendly|トーン|笑顔|丁寧|礼儀)/i,
    defaultIcon: 'heart',
  },
  {
    variant: 'timeline-track',
    category: 'grammar',
    label: 'Đường chạy tiến độ',
    description: 'Thanh đường chạy với cờ đích (early / on time / late)',
    keywords: /(early|late|on time|in time|deadline|schedule)/i,
    defaultIcon: 'clock',
  },
  {
    variant: 'checklist-card',
    category: 'grammar',
    label: 'Bảng Checklist ✔ / ✘',
    description: 'Thẻ kiểm tra mẫu câu đúng và sai',
    keywords: /\b(checklist|correct|wrong example|mistakes?|grammar check)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'dialogue-upgrade',
    category: 'dialogue',
    label: 'Nâng cấp hội thoại (Boring → Natural)',
    description: 'Bảng mũi tên biến câu cơ bản sang câu tự nhiên',
    keywords: /\b(don't say|instead of|upgrade|boring|natural|native say|more natural)\b/i,
    defaultIcon: 'sparkles',
  },
  {
    variant: 'spatial-boxes',
    category: 'grammar',
    label: '3 Hộp khái niệm / Giới từ',
    description: '3 hộp icon (AT / ON / IN hoặc 3 quy tắc ngắn)',
    keywords: /\b(at|on|in|preposition|between|among|surface|inside|point)\b/i,
    defaultIcon: 'map-pin',
  },
  {
    variant: 'phrase-icon-split',
    category: 'vocab',
    label: 'Câu tách icon (@168 Look/See/Watch)',
    description: 'Khung tổng hợp quy tắc trên cùng, quote lớn kèm thẻ icon vector và pill từ nhấn',
    keywords: /\b(look|see|watch|hear|listen|say|tell|talk|make|do|borrow|lend)\b/i,
    defaultIcon: 'eye',
  },
  {
    variant: 'trio-icon-cards',
    category: 'vocab',
    label: 'Bộ 3 Thẻ Icon (@168 Trio Cards)',
    description: '3 thẻ bo tròn nổi bật xếp ngang kèm icon + nhãn ngắn gọn (Look / See / Watch)',
    keywords: /\b(look.*see.*watch|hear.*listen.*sound|three ways|three verbs|trio)\b/i,
    defaultIcon: 'eye',
  },
  {
    variant: 'contrast-pair-cards',
    category: 'grammar',
    label: 'Cặp Thẻ Đối Chiếu (@168 Swap / Vs)',
    description: '2 thẻ viền màu lớn đối chiếu qua biểu tượng ⊗ hoặc → ở giữa (Look ⊗ Watch)',
    keywords: /\b(can't swap|swap them|difference between|compare pair|not the same)\b/i,
    defaultIcon: 'scale',
  },
  {
    variant: 'quiz-fill-blank',
    category: 'dialogue',
    label: 'Thẻ Quiz Điền Từ (@168 Fill Blank)',
    description: 'Pill Question + câu điền chỗ trống ______ + hình minh họa gợi ý ngay phía dưới',
    keywords: /\b(question \d|fill in|blank|____+|without my glasses|your turn)\b/i,
    defaultIcon: 'glasses',
  },

  // ── Pronunciation & Listening @englishpracticing168 ──────────────────────
  {
    variant: 'syllable-stress',
    category: 'pronunciation',
    label: 'Nhấn trọng âm âm tiết',
    description: 'Chia âm tiết với vòng tròn trọng âm to/nhỏ rõ ràng',
    keywords: /\b(syllable|stress|emphasis|accent|intonation pattern|reCORD|REcord|preSENT)\b/i,
    defaultIcon: 'mic',
  },
  {
    variant: 'intonation-curve',
    category: 'pronunciation',
    label: 'Đường ngữ điệu lên/xuống giọng',
    description: 'Đường sóng cong hướng dẫn lên giọng câu hỏi & xuống giọng khẳng định',
    keywords: /\b(intonation|rising|falling|question pitch|voice goes up|voice goes down|sound natural)\b/i,
    defaultIcon: 'music',
  },
  {
    variant: 'ear-listen',
    category: 'pronunciation',
    label: 'Luyện nghe & Quiz tai nghe',
    description: 'Tai nghe + cột sóng âm thanh luyện nghe',
    keywords: /(ear|listen|quiz|check|sound|pronounc|耳|チェック|聞こえ)/i,
    defaultIcon: 'listen',
  },
  {
    variant: 'lightbulb-tip',
    category: 'dialogue',
    label: 'Bóng đèn mẹo hay (Pro Tip)',
    description: 'Bóng đèn phát sáng kèm dấu tick mẹo ghi nhớ nhanh',
    keywords: /(tip|secret|remember|trick|note|pro tip|rule of thumb|コツ|大事|迷ったら)/i,
    defaultIcon: 'lightning',
  },
  {
    variant: 'avatar-speech',
    category: 'dialogue',
    label: 'Nhân vật & Bóng thoại',
    description: 'Nhân vật nói câu thoại và nhãn phản hồi tức thì',
    keywords: /\b(ask politely|respond|reply|avatar|character|speaker)\b/i,
    defaultIcon: 'chat',
  },
  {
    variant: 'speech-bubble',
    category: 'dialogue',
    label: 'Bóng thoại sóng âm',
    description: 'Bóng thoại kèm thanh equalizer sống động',
    keywords: /\b(speak|sentence|phrase|expression|say it)\b/i,
    defaultIcon: 'chat',
  },
  {
    variant: 'pronunciation-wave',
    category: 'pronunciation',
    label: 'Sóng âm phát âm đa sắc',
    description: 'Dải thanh tần số nhịp nhàng theo từng âm đọc',
    keywords: /\b(wave|phonetic|ipa|vowel|consonant|silent letter)\b/i,
    defaultIcon: 'music',
  },

  // ── Bootstrap 5 UI & Modern CSS Card Components ──────────────────────────
  {
    variant: 'bs-alert-tip',
    category: 'grammar',
    label: 'Bootstrap Alert Callout',
    description: 'Thẻ cảnh báo Bootstrap với thanh viền trái, pill HEADS UP và nội dung chú ý',
    keywords: /\b(warning|caution|alert|avoid saying|careful|watch out|common error|attention)\b/i,
    defaultIcon: 'lightning',
  },
  {
    variant: 'bs-card-header',
    category: 'grammar',
    label: 'Bootstrap Header Card',
    description: 'Thẻ Bootstrap có thanh tiêu đề màu nổi, nội dung chính và footer checkmark',
    keywords: /\b(summary|lesson card|rule|structure|template|overview|pattern)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'bs-progress-meter',
    category: 'vocab',
    label: 'Bootstrap Progress Bar',
    description: 'Thanh tiến độ sọc chuyển động kèm huy hiệu % (Fluency / Goal / Level)',
    keywords: /\b(progress|percent|fluency|milestone|goal|level up|confidence|mastery)\b/i,
    defaultIcon: 'sparkles',
  },
  {
    variant: 'bs-toast-notify',
    category: 'dialogue',
    label: 'Bootstrap Toast Notification',
    description: 'Thẻ thông báo Toast nổi kèm trạng thái verified và câu thoại gợi ý',
    keywords: /\b(notification|toast|unlocked|new phrase|daily challenge|reminder|just now)\b/i,
    defaultIcon: 'chat',
  },
  {
    variant: 'bs-list-group',
    category: 'vocab',
    label: 'Bootstrap List Group',
    description: 'Danh sách thẻ 3 dòng đánh số 1-2-3 kèm trạng thái Active & badge',
    keywords: /\b(list|top 3|three ways|reasons|options|alternatives|checklist items)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'bs-pricing-tier',
    category: 'dialogue',
    label: 'Bootstrap 2-Column Compare Tier',
    description: 'So sánh 2 cột Basic vs Recommended chuẩn giao diện bảng giá Bootstrap',
    keywords: /\b(basic vs|pro|recommended|tier|compare styles|textbook vs native)\b/i,
    defaultIcon: 'scale',
  },
  {
    variant: 'bs-accordion-faq',
    category: 'grammar',
    label: 'Bootstrap Q&A Accordion',
    description: 'Thẻ hỏi đáp đóng/mở Q&A giải thích thắc mắc ngữ pháp nhanh',
    keywords: /\b(faq|why do natives|frequently asked|question and answer|wonder why)\b/i,
    defaultIcon: 'brain',
  },
  {
    variant: 'bs-breadcrumb-path',
    category: 'grammar',
    label: 'Bootstrap Breadcrumb Path',
    description: 'Thanh điều hướng từng chặng (Context › Pattern › Fluent)',
    keywords: /\b(pathway|roadmap|breadcrumb|stage|journey|from beginner to)\b/i,
    defaultIcon: 'walk',
  },
  {
    variant: 'css-bento-stats',
    category: 'vocab',
    label: 'CSS Bento Grid 2×2',
    description: 'Lưới 4 ô Bento hiện đại tổng hợp từ vựng, sắc thái, phát âm & ví dụ',
    keywords: /\b(bento|dashboard|breakdown|all-in-one|four parts|key takeaways)\b/i,
    defaultIcon: 'sparkles',
  },
  {
    variant: 'css-glass-quote',
    category: 'dialogue',
    label: 'CSS Glassmorphism Quote',
    description: 'Thẻ trích dẫn hiệu ứng kính mờ gradient tinh tế kèm pill tác giả',
    keywords: /\b(quote|motto|proverb|saying|mindset|takeaway|wisdom)\b/i,
    defaultIcon: 'heart',
  },
  {
    variant: 'css-chat-thread',
    category: 'dialogue',
    label: 'CSS Modern Chat Thread',
    description: 'Khung tin nhắn 2 bong bóng hỏi-đáp hiện đại kiểu iMessage / Messenger',
    keywords: /\b(dialogue|replying|texting|conversation exchange|ask and answer|respond with)\b/i,
    defaultIcon: 'chat',
  },
  {
    variant: 'css-roadmap-steps',
    category: 'grammar',
    label: 'CSS 3-Step Horizontal Roadmap',
    description: 'Sơ đồ 3 bước đánh số 01-02-03 nối đường ngang thanh thoát',
    keywords: /\b(three steps|step 1|step 2|step 3|process|method|how to say)\b/i,
    defaultIcon: 'walk',
  },
  {
    variant: 'css-toggle-switch',
    category: 'dialogue',
    label: 'CSS Toggle Switch (OFF → ON)',
    description: 'Công tắc bật/tắt so sánh chế độ Basic (OFF) sang Native (ON)',
    keywords: /\b(switch|toggle|turn on|mindset shift|mode|upgrade your english)\b/i,
    defaultIcon: 'lightning',
  },
  {
    variant: 'css-browser-mockup',
    category: 'life',
    label: 'CSS Browser Window Card',
    description: 'Cửa sổ trình duyệt macOS 3 nút màu, thanh URL và thẻ nội dung trung tâm',
    keywords: /\b(website|browser|online search|google|article|blog|link|url|reading online)\b/i,
    defaultIcon: 'laptop',
  },
  {
    variant: 'css-grammar-equation',
    category: 'grammar',
    label: 'CSS Grammar Token Equation',
    description: 'Công thức ghép khối màu: [Modal] + [Verb] = [Polite Request]',
    keywords: /\b(formula|equation|combine|plus|grammar rule|syntax|verb pattern)\b/i,
    defaultIcon: 'brain',
  },
  {
    variant: 'css-flashcard-flip',
    category: 'vocab',
    label: 'CSS Layered Flip Flashcard',
    description: 'Thẻ Flashcard xếp lớp 2 tầng hiển thị từ vựng, phiên âm IPA và nghĩa',
    keywords: /\b(flashcard|new word|vocab|definition|meaning|memorize|anki)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'css-sticky-note',
    category: 'grammar',
    label: 'CSS Sticky Note Rule',
    description: 'Giấy ghi chú dán tường kèm đinh ghim & quy tắc cần nhớ kiểu @englishpracticing168',
    keywords: /\b(sticky note|rule of thumb|golden rule|quick note|reminder|don't forget)\b/i,
    defaultIcon: 'pencil',
  },
  {
    variant: 'bs-badge-cluster',
    category: 'vocab',
    label: 'Bootstrap Pill Badge Cluster',
    description: 'Cụm pill đa màu liệt kê 3-4 từ đồng nghĩa / collocation / sắc thái thay thế',
    keywords: /\b(synonym|other ways to say|alternatives|collocation|phrases|instead of)\b/i,
    defaultIcon: 'sparkles',
  },
  {
    variant: 'css-magnifying-word',
    category: 'vocab',
    label: 'CSS Spotlight Word Zoom',
    description: 'Kính lúp phóng đại cụm từ trọng tâm và sắc thái sử dụng',
    keywords: /\b(zoom in|focus on|closer look|nuance|keyword|meaning behind|spotlight)\b/i,
    defaultIcon: 'eye',
  },
  {
    variant: 'bs-modal-quiz',
    category: 'dialogue',
    label: 'Bootstrap Mini Quiz Modal',
    description: 'Cửa sổ Modal Bootstrap đặt câu hỏi tương tác với 2 nút lựa chọn',
    keywords: /\b(quick check|pop quiz|choose one|pick the best|mini test)\b/i,
    defaultIcon: 'brain',
  },
  // ── @englishpracticing168 Signature Infographic Templates ────────────────
  {
    variant: 'p168-step-quiz-formula',
    category: 'grammar',
    label: '@168 Quiz 5 Bước + Công Thức',
    description: 'Thanh tiến trình 1-5, pill Question xanh, khung trắc nghiệm (A)/(B) & 2 thanh công thức nhớ nhanh (@englishpracticing168)',
    keywords: /\b(lend|borrow|choose a or b|fill in the blank|five steps|question 1|word choice|multiple choice)\b/i,
    defaultIcon: 'brain',
  },
  {
    variant: 'p168-grammar-formula',
    category: 'grammar',
    label: '@168 Ngữ Pháp 3 Tab + Equation',
    description: '3 tab chuyển cấu trúc trên cùng, badge Rule xanh, phương trình [Part A] + [Part B] và icon trọng tâm (@englishpracticing168)',
    keywords: /\b(used to|be used to|get used to|grammar formula|sentence structure|pattern|verb \+|first:)\b/i,
    defaultIcon: 'book',
  },
  {
    variant: 'p168-pronunciation-matrix',
    category: 'pronunciation',
    label: '@168 Bảng Phát Âm 3 Cột (-ed / -s / Âm)',
    description: '3 thẻ cột bo tròn chia nhóm phát âm (T/D/ID hoặc Snake S/Bee Z/IZ) kèm từ ví dụ tô màu đuôi (@englishpracticing168)',
    keywords: /\b(t sound|d sound|id sound|pronunciation|ending sound|worked|played|waited|plural|voiced|voiceless|syllable)\b/i,
    defaultIcon: 'mic',
  },
  {
    variant: 'p168-situation-cards',
    category: 'dialogue',
    label: '@168 Tình Huống Giao Tiếp 2 Bối Cảnh',
    description: '3 mốc bước 1-2-3, tiêu đề nổi bật và 2 thẻ ngữ cảnh Friends (thân mật) vs Work (trang trọng) (@englishpracticing168)',
    keywords: /\b(with friends|at work|say no|softly|polite refusal|casual vs formal|daily conversation|social tip)\b/i,
    defaultIcon: 'handshake',
  },
  {
    variant: 'p168-slider-compare',
    category: 'grammar',
    label: '@168 Thanh Trượt So Sánh 2 Thì / Sắc Thái',
    description: '2 tab đối chiếu, thanh kéo timeline xanh phát sáng và nút đáp án xanh đậm bên dưới (@englishpracticing168)',
    keywords: /\b(past simple|present perfect|how to choose|finished action|still true|slider|difference between)\b/i,
    defaultIcon: 'scale',
  },
  {
    variant: 'p168-story-dialogue',
    category: 'dialogue',
    label: '@168 Truyện Ngắn & Bóng Thoại Hỏi Đáp',
    description: 'Thanh tab Story/Question/Detail, nhân vật hoạt hình + bong bóng thoại và thanh highlight cụm khóa (@englishpracticing168)',
    keywords: /\b(story|roommate|dialogue bubble|short story|meet sam|leans in|freezes|what happened)\b/i,
    defaultIcon: 'chat',
  },
];

export const ALL_SCENE_ICONS: IllustrationSceneIcon[] = SCENE_ICON_KEYWORDS.map((s) => s.icon);

export const ALL_ILLUSTRATION_VARIANTS: IllustrationVariant[] = [
  ...VECTOR_COMPONENT_CATALOG.map((c) => c.variant),
  'dynamic-scene',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface EffectiveVectorComponentEntry {
  variant: IllustrationVariant;
  category: VectorCategory;
  label: string;
  description: string;
  defaultIcon: IllustrationSceneIcon;
  keywordsText: string;
  isCustom: boolean;
  isOverride: boolean;
  keywordsRe: RegExp;
}

export function getEffectiveVectorCatalog(): EffectiveVectorComponentEntry[] {
  const customs = getCustomComponentsSnapshot();
  const customMap = new Map(customs.map((c) => [c.variant, c]));

  const entries: EffectiveVectorComponentEntry[] = [];
  const added = new Set<string>();

  // 1. Custom / overridden components first (highest priority)
  for (const c of customs) {
    const kwList = c.keywords.filter(Boolean);
    const re =
      kwList.length > 0
        ? new RegExp(`(${kwList.map(escapeRegExp).join('|')})`, 'i')
        : /$^/;
    entries.push({
      variant: c.variant,
      category: c.category,
      label: c.label,
      description: c.description,
      defaultIcon: c.defaultIcon,
      keywordsText: kwList.join(', '),
      isCustom: !VECTOR_COMPONENT_CATALOG.some((b) => b.variant === c.variant),
      isOverride: VECTOR_COMPONENT_CATALOG.some((b) => b.variant === c.variant),
      keywordsRe: re,
    });
    added.add(c.variant);
  }

  // 2. Remaining active built-in components
  for (const b of VECTOR_COMPONENT_CATALOG) {
    if (added.has(b.variant) || isBuiltInVariantDeleted(b.variant)) continue;
    entries.push({
      variant: b.variant,
      category: b.category,
      label: b.label,
      description: b.description,
      defaultIcon: b.defaultIcon,
      keywordsText: b.keywords.source,
      isCustom: false,
      isOverride: false,
      keywordsRe: b.keywords,
    });
  }

  return entries;
}

export function isKnownIllustrationVariant(variant: string | undefined): variant is IllustrationVariant {
  if (!variant) return false;
  if (variant === 'dynamic-scene') return true;
  return getEffectiveVectorCatalog().some((e) => e.variant === variant);
}

export function pickContextualSceneIcon(
  text: string,
  fallback: IllustrationSceneIcon = 'sparkles',
): IllustrationSceneIcon {
  const t = text.trim();
  if (!t) return fallback;
  // Preserve explicit priority for TV / Look / See / Watch / Walk / Phone when present
  const lower = t.toLowerCase();
  if (/(tv|television|screen|movie|film|video)/.test(lower)) return 'tv';
  if (/\b(glasses|eyeglasses|spectacles)\b/.test(lower)) return 'glasses';
  if (/\bwatch\b/.test(lower) && /(moving|action|game|match)/.test(lower)) return 'watch';
  if (/\b(look|see|eye|watch)\b/.test(lower)) return 'eye';
  if (/(listen|hear|sound|ear)/.test(lower)) return 'listen';
  if (/(walk|run|move|step)/.test(lower)) return 'walk';
  if (/(phone|call|message|text)/.test(lower)) return 'phone';

  for (const entry of SCENE_ICON_KEYWORDS) {
    if (entry.keywords.test(t)) return entry.icon;
  }
  return fallback;
}

function cleanSnippet(text: string, maxLen = 64): string {
  const cleaned = text.replace(/["“”'「」]/g, '').trim();
  if (cleaned.length <= maxLen) return cleaned;
  const slice = cleaned.slice(0, maxLen).trim();
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace >= Math.floor(maxLen * 0.5) ? slice.slice(0, lastSpace).trim() : slice;
}

function extractTimeHint(text: string): { hour: number; minute: number; formula: string } | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    const h = Math.max(1, Math.min(12, Number(m[1]) % 12 || 12));
    const min = Math.max(0, Math.min(59, Number(m[2])));
    return { hour: h, minute: min, formula: `${m[1]}:${m[2]}` };
  }
  if (/\b(clock|o'clock|twenty past|half past|quarter)\b/i.test(text)) {
    return { hour: 8, minute: 20, formula: '8:20' };
  }
  return null;
}

function buildDynamicContrastSpec(cueText: string, cardText?: string): DynamicSceneSpec | null {
  const source = `${cueText} ${cardText ?? ''}`.trim();
  // Detect contrast pattern: "Don't say X, say Y" / "Stop saying X. Say Y" / "X vs Y" / "X -> Y"
  const stopMatch = source.match(/(?:stop saying|don't say|instead of)\s+["“]?([^"”.,;!?]+)["”]?[\s.,;!?]+(?:say|try|use)\s+["“]?([^"”.!?]+)["”]?/i);
  if (stopMatch) {
    const left = cleanSnippet(stopMatch[1], 48);
    const right = cleanSnippet(stopMatch[2], 48);
    return {
      layout: 'split-compare',
      badgeText: 'NATURAL UPGRADE',
      connector: 'arrow',
      motifs: [
        {
          icon: pickContextualSceneIcon(left, 'chat'),
          label: left,
          sublabel: 'Basic',
          accent: '#DC2626',
          status: 'cross',
        },
        {
          icon: pickContextualSceneIcon(right, 'sparkles'),
          label: right,
          sublabel: 'Natural',
          accent: '#16A34A',
          status: 'check',
        },
      ],
    };
  }

  const vsMatch = source.match(/\b([A-Za-z][A-Za-z\s]{1,18})\s+(?:vs\.?|versus)\s+([A-Za-z][A-Za-z\s]{1,18})/i);
  if (vsMatch) {
    const left = cleanSnippet(vsMatch[1], 18);
    const right = cleanSnippet(vsMatch[2], 18);
    return {
      layout: 'split-compare',
      badgeText: 'KEY DIFFERENCE',
      connector: 'vs',
      motifs: [
        {
          icon: pickContextualSceneIcon(left, 'book'),
          label: left,
          accent: '#2563EB',
          status: 'neutral',
        },
        {
          icon: pickContextualSceneIcon(right, 'sparkles'),
          label: right,
          accent: '#7C3AED',
          status: 'neutral',
        },
      ],
    };
  }

  return null;
}

export interface ContextualVisualResolution {
  variant: IllustrationVariant;
  sceneIcon: IllustrationSceneIcon;
  category: VectorCategory;
  data?: IllustrationPropData;
  matchedRule: string;
}

/**
 * Context-locked resolver: takes a single cue's text (and optional card text)
 * and deterministically maps it to the best semantic visual component + icon + data.
 */
export function resolveContextualVisualForCue(
  cueText: string,
  cardText?: string,
  fallbackVariant: IllustrationVariant = 'speech-bubble',
): ContextualVisualResolution {
  const combined = `${cueText} ${cardText ?? ''}`.trim();
  const t = combined.toLowerCase();
  const icon = pickContextualSceneIcon(combined, 'chat');

  // 0. Check user/AI custom registered vector components first
  const customs = getCustomComponentsSnapshot();
  for (const custom of customs) {
    if (custom.keywords.length === 0) continue;
    const hit = custom.keywords.some((kw) => {
      const k = kw.trim().toLowerCase();
      return k.length >= 2 && t.includes(k);
    });
    if (hit) {
      return {
        variant: custom.variant,
        sceneIcon: custom.defaultIcon,
        category: custom.category,
        matchedRule: `custom-${custom.variant}`,
        data: {
          title: cleanSnippet(cardText || cueText || custom.label, 24),
          sceneIcon: custom.defaultIcon,
        },
      };
    }
  }

  // 1. Preserve strict high-precision semantic hits first
  if (/\b(\d{1,2}:\d{2}|clock|o'clock|twenty past|half past|quarter)\b/.test(t)) {
    const timeHint = extractTimeHint(combined) ?? { hour: 8, minute: 20, formula: '8:20' };
    return {
      variant: 'clock-face',
      sceneIcon: 'clock',
      category: 'life',
      matchedRule: 'time-clock',
      data: {
        timeHour: timeHint.hour,
        timeMinute: timeHint.minute,
        formula: timeHint.formula,
        subtitle: cleanSnippet(cardText || cueText, 24),
        sceneIcon: 'clock',
      },
    };
  }

  if (/(coffee|espresso|latte|cappuccino|コーヒー|カフェ)/.test(t) && !/(water|水)/.test(t)) {
    return {
      variant: 'coffee-cup',
      sceneIcon: 'cup',
      category: 'life',
      matchedRule: 'coffee',
      data: { title: cleanSnippet(cardText || 'Coffee order', 24), sceneIcon: 'cup' },
    };
  }

  if (/(water|drink|thirsty|salt|cafe|喉が渇|水|カフェ)/.test(t)) {
    return {
      variant: 'cafe-water',
      sceneIcon: 'cup',
      category: 'life',
      matchedRule: 'cafe-water',
      data: { title: cleanSnippet(cardText || 'At the cafe', 24), sceneIcon: 'cup' },
    };
  }

  if (/(office|boss|manager|friday|meeting|email|work|上司|オフィス|メール|金曜)/.test(t)) {
    return {
      variant: 'office-work',
      sceneIcon: 'briefcase',
      category: 'life',
      matchedRule: 'office-work',
      data: { title: cleanSnippet(cardText || 'At the office', 24), sceneIcon: 'briefcase' },
    };
  }

  if (/(hotel|reception|lobby|desk|check-in|ホテル)/.test(t)) {
    return {
      variant: 'hotel-desk',
      sceneIcon: 'map-pin',
      category: 'life',
      matchedRule: 'hotel-desk',
      data: { title: cleanSnippet(cardText || 'Hotel reception', 24), sceneIcon: 'map-pin' },
    };
  }

  if (/(friend|family|casual|classmate|colleague|友達|家族|同僚|先生)/.test(t)) {
    return {
      variant: 'friends-chat',
      sceneIcon: 'chat',
      category: 'dialogue',
      matchedRule: 'friends-chat',
      data: { sceneIcon: 'chat' },
    };
  }

  // 2. Expanded real-world scenes (@englishpracticing168 daily life library)
  const expandedLifeChecks: Array<{
    variant: IllustrationVariant;
    re: RegExp;
    icon: IllustrationSceneIcon;
    rule: string;
  }> = [
    {
      variant: 'airport-travel',
      re: /\b(airport|flight|boarding|gate|passport|luggage|baggage|suitcase|plane|airplane)\b/,
      icon: 'airplane',
      rule: 'airport-travel',
    },
    {
      variant: 'restaurant-order',
      re: /\b(restaurant|menu|waiter|waitress|order food|bill|check please|table for|appetizer|dinner)\b/,
      icon: 'menu',
      rule: 'restaurant-order',
    },
    {
      variant: 'shopping-price',
      re: /\b(shop|shopping|store|discount|sale|price|how much|fitting room|try it on|receipt|refund|dollars?)\b/,
      icon: 'shopping-bag',
      rule: 'shopping-price',
    },
    {
      variant: 'doctor-health',
      re: /\b(doctor|hospital|clinic|sick|headache|stomachache|fever|cough|medicine|pharmacy|symptom|pain)\b/,
      icon: 'stethoscope',
      rule: 'doctor-health',
    },
    {
      variant: 'weather-forecast',
      re: /\b(weather|forecast|sunny|rain|raining|freezing|chilly|humid|cloudy|umbrella|temperature|snow)\b/,
      icon: 'sun',
      rule: 'weather-forecast',
    },
    {
      variant: 'study-desk',
      re: /\b(study|homework|exam|test|school|university|library|notebook|textbook|flashcard|vocabulary)\b/,
      icon: 'book',
      rule: 'study-desk',
    },
    {
      variant: 'commute-transport',
      re: /\b(bus|train|subway|metro|station|taxi|traffic|drive|commute|platform)\b/,
      icon: 'bus',
      rule: 'commute-transport',
    },
    {
      variant: 'home-routine',
      re: /\b(wake up|get up|breakfast|bedtime|house|apartment|chores|morning routine)\b/,
      icon: 'home',
      rule: 'home-routine',
    },
    {
      variant: 'gym-fitness',
      re: /\b(gym|workout|exercise|fitness|jogging|muscle|healthy habit)\b/,
      icon: 'dumbbell',
      rule: 'gym-fitness',
    },
    {
      variant: 'phone-call',
      re: /\b(phone|call|ring|hang up|voicemail|missed call|text message)\b/,
      icon: 'phone',
      rule: 'phone-call',
    },
  ];

  for (const chk of expandedLifeChecks) {
    if (chk.re.test(t)) {
      return {
        variant: chk.variant,
        sceneIcon: chk.icon,
        category: 'life',
        matchedRule: chk.rule,
        data: {
          title: cleanSnippet(cardText || cueText, 24),
          subtitle: chk.rule.replace('-', ' '),
          sceneIcon: chk.icon,
          speechText: cleanSnippet(cardText || cueText, 30),
        },
      };
    }
  }

  // 2b. High-specificity multi-word Bootstrap / Modern CSS UI matches before broad single-word fallbacks
  if (/\b(golden rule|don't forget|quick note|sticky note|rule of thumb)\b/.test(t)) {
    return {
      variant: 'css-sticky-note',
      sceneIcon: 'pencil',
      category: 'grammar',
      matchedRule: 'css-sticky-note',
      data: {
        title: cleanSnippet(cardText || cueText, 28),
        subtitle: cleanSnippet(cueText, 36),
        speechText: cleanSnippet(cardText || cueText, 36),
        sceneIcon: 'pencil',
      },
    };
  }
  if (/\b(quick check|pop quiz|pick the best|choose one|mini test)\b/.test(t)) {
    return {
      variant: 'bs-modal-quiz',
      sceneIcon: 'brain',
      category: 'dialogue',
      matchedRule: 'bs-modal-quiz',
      data: {
        title: cleanSnippet(cardText || cueText, 28),
        subtitle: cleanSnippet(cueText, 36),
        speechText: cleanSnippet(cardText || cueText, 36),
        sceneIcon: 'brain',
      },
    };
  }
  if (/\b(zoom in|closer look|nuance|focus on|spotlight)\b/.test(t)) {
    return {
      variant: 'css-magnifying-word',
      sceneIcon: 'eye',
      category: 'vocab',
      matchedRule: 'css-magnifying-word',
      data: {
        title: cleanSnippet(cardText || cueText, 28),
        subtitle: cleanSnippet(cueText, 36),
        speechText: cleanSnippet(cardText || cueText, 36),
        sceneIcon: 'eye',
      },
    };
  }
  if (/\b(synonym|other ways|instead of|alternatives|collocation)\b/.test(t)) {
    return {
      variant: 'bs-badge-cluster',
      sceneIcon: 'sparkles',
      category: 'vocab',
      matchedRule: 'bs-badge-cluster',
      data: {
        title: cleanSnippet(cardText || cueText, 28),
        subtitle: cleanSnippet(cueText, 36),
        speechText: cleanSnippet(cardText || cueText, 36),
        sceneIcon: 'sparkles',
      },
    };
  }

  // 3. Expanded Grammar / Vocab / Pronunciation visuals
  if (/(ladder|stair|step|level|stage|past|present|future|階段|段)/.test(t)) {
    return {
      variant: 'flow-diagram',
      sceneIcon: 'walk',
      category: 'grammar',
      matchedRule: 'flow-diagram',
      data: { sceneIcon: 'walk' },
    };
  }
  if (/(tone|polite|rude|warm|smile|friendly|トーン|笑顔|丁寧|礼儀)/.test(t)) {
    return {
      variant: 'gauge-arc',
      sceneIcon: 'heart',
      category: 'dialogue',
      matchedRule: 'gauge-arc',
      data: {
        title: 'Tone & Attitude',
        subtitle: /rude|blunt|cold/.test(t) ? 'Too direct' : 'Polite & Warm',
        value: /rude|blunt|cold/.test(t) ? 0.18 : 0.84,
        sceneIcon: 'heart',
      },
    };
  }
  if (/(\bear\b|listen|quiz|check|sound|pronounc|耳|チェック|聞こえ)/.test(t)) {
    return {
      variant: 'ear-listen',
      sceneIcon: 'listen',
      category: 'pronunciation',
      matchedRule: 'ear-listen',
      data: { sceneIcon: 'listen', title: cleanSnippet(cardText || 'Listen closely', 24) },
    };
  }
  if (/\b(syllable|stress|accent|reCORD|REcord)\b/i.test(combined)) {
    return {
      variant: 'syllable-stress',
      sceneIcon: 'mic',
      category: 'pronunciation',
      matchedRule: 'syllable-stress',
      data: {
        title: 'Word Stress',
        speechText: cleanSnippet(cardText || cueText, 22),
        labels: ['pre', 'SENT'],
        value: 1,
        sceneIcon: 'mic',
      },
    };
  }
  if (/\b(intonation|rising|falling|pitch|goes up|goes down)\b/i.test(t)) {
    return {
      variant: 'intonation-curve',
      sceneIcon: 'music',
      category: 'pronunciation',
      matchedRule: 'intonation-curve',
      data: {
        title: 'Intonation',
        speechText: cleanSnippet(cardText || cueText, 26),
        value: /\?|yes\/no|rising|up/i.test(t) ? 0.85 : 0.25,
        sceneIcon: 'music',
      },
    };
  }
  if (/(tip|secret|remember|trick|note|コツ|大事|迷ったら)/.test(t)) {
    return {
      variant: 'lightbulb-tip',
      sceneIcon: 'lightning',
      category: 'dialogue',
      matchedRule: 'lightbulb-tip',
      data: { sceneIcon: 'lightning', title: cleanSnippet(cardText || 'Pro Tip', 24) },
    };
  }
  if (/(early|late|on time|in time|deadline|schedule)/.test(t)) {
    return {
      variant: 'timeline-track',
      sceneIcon: 'clock',
      category: 'grammar',
      matchedRule: 'timeline-track',
      data: { labels: ['Early', 'On time', 'Late'], value: /late/.test(t) ? 0.88 : 0.45, sceneIcon: 'clock' },
    };
  }

  // 4. Explicit contrast comparisons ("Stop saying X. Say Y", "X vs Y") -> bespoke dynamic-scene
  const contrastSpec = buildDynamicContrastSpec(cueText, cardText);
  if (contrastSpec) {
    return {
      variant: 'dynamic-scene',
      sceneIcon: icon,
      category: 'dialogue',
      matchedRule: 'dynamic-contrast',
      data: {
        sceneIcon: icon,
        dynamicScene: contrastSpec,
      },
    };
  }

  if (/\b(very\s+\w+|exhausted|freezing|thrilled|furious|tiny|huge|enormous)\b/i.test(t)) {
    return {
      variant: 'degree-scale',
      sceneIcon: 'sparkles',
      category: 'vocab',
      matchedRule: 'degree-scale',
      data: {
        title: 'Intensity Upgrade',
        labels: ['Basic', 'Stronger', 'Native!'],
        speechText: cleanSnippet(cardText || cueText, 24),
        value: /very\s+\w+/i.test(t) && !/stop saying/i.test(t) ? 0.3 : 0.9,
        sceneIcon: 'sparkles',
      },
    };
  }
  if (/\b(give up|turn on|turn off|put off|look forward|pick up|run out|break down|figure out|phrasal)\b/i.test(t)) {
    const pv = combined.match(/\b(give up|turn on|turn off|put off|look forward|pick up|run out|break down|figure out)\b/i);
    const parts = (pv?.[1] || 'give up').split(/\s+/);
    return {
      variant: 'phrasal-split',
      sceneIcon: 'lightning',
      category: 'vocab',
      matchedRule: 'phrasal-split',
      data: {
        title: 'Phrasal Verb',
        labels: [parts[0] || 'Verb', parts[1] || 'Particle'],
        formula: cleanSnippet(cardText || cueText, 26),
        sceneIcon: 'lightning',
      },
    };
  }
  if (/\b(idiom|piece of cake|break a leg|under the weather|hit the sack)\b/i.test(t)) {
    return {
      variant: 'idiom-split',
      sceneIcon: 'brain',
      category: 'vocab',
      matchedRule: 'idiom-split',
      data: {
        title: 'Idiom Decoder',
        speechText: cleanSnippet(cardText || cueText, 24),
        subtitle: 'Literal ≠ Real meaning',
        sceneIcon: 'brain',
      },
    };
  }
  if (/\b(yesterday|tomorrow|already|since|will|going to|used to|tense)\b/i.test(t)) {
    return {
      variant: 'tense-timeline',
      sceneIcon: 'calendar',
      category: 'grammar',
      matchedRule: 'tense-timeline',
      data: {
        labels: ['Past', 'Now', 'Future'],
        value: /yesterday|used to|ago/.test(t) ? 0.16 : /tomorrow|will|going to/.test(t) ? 0.84 : 0.5,
        formula: cleanSnippet(cardText || cueText, 24),
        sceneIcon: 'calendar',
      },
    };
  }
  if (/\b(question\s*\d+|fill in|____+|without my glasses)\b/i.test(t)) {
    const qLabelMatch = combined.match(/\b(question\s*\d+)\b/i);
    return {
      variant: 'quiz-fill-blank',
      sceneIcon: /\bglasses\b/i.test(t) ? 'glasses' : icon,
      category: 'dialogue',
      matchedRule: 'quiz-fill-blank',
      data: {
        title: qLabelMatch?.[1] || 'Question',
        speechText: cleanSnippet(cardText || cueText, 44),
        highlightWord: /\b(see|watch|look|could|may)\b/i.exec(t)?.[1] ?? undefined,
        sceneIcon: /\bglasses\b/i.test(t) ? 'glasses' : icon,
      },
    };
  }
  if (/\b(can't swap|swap them|difference between|not the same|mix them up)\b/i.test(t)) {
    return {
      variant: 'contrast-pair-cards',
      sceneIcon: 'scale',
      category: 'grammar',
      matchedRule: 'contrast-pair-cards',
      data: {
        title: "You can't swap them",
        labels: /\b(look|watch)\b/i.test(t) ? ['Look', 'Watch'] : ['Literal', 'Natural'],
        formula: 'cross',
        sceneIcon: 'scale',
      },
    };
  }
  if (/(look.*see.*watch|hear.*listen.*sound|say.*tell.*talk|three ways)/i.test(t)) {
    return {
      variant: 'trio-icon-cards',
      sceneIcon: 'eye',
      category: 'vocab',
      matchedRule: 'trio-icon-cards',
      data: {
        nodes: [
          { label: 'Look', sublabel: 'on purpose', sceneIcon: 'eye', color: '#2563EB' },
          { label: 'See', sublabel: 'automatic', sceneIcon: 'glasses', color: '#64748B' },
          { label: 'Watch', sublabel: 'moving', sceneIcon: 'tv', color: '#D97706' },
        ],
        sceneIcon: 'eye',
      },
    };
  }
  if (/\b(look|see|watch|hear|listen|say|tell|talk)\b/.test(t)) {
    return {
      variant: 'phrase-icon-split',
      sceneIcon: icon,
      category: 'vocab',
      matchedRule: 'phrase-icon-split',
      data: {
        sceneIcon: icon,
        speechText: cleanSnippet(cardText || cueText, 24),
      },
    };
  }

  // 4b. Bootstrap & Modern CSS Infographic Matches
  const uiChecks: Array<{
    variant: IllustrationVariant;
    re: RegExp;
    category: VectorCategory;
    icon: IllustrationSceneIcon;
    rule: string;
  }> = [
    {
      variant: 'css-grammar-equation',
      re: /\b(formula|equation|grammar rule|syntax|verb pattern)\b/,
      category: 'grammar',
      icon: 'brain',
      rule: 'css-grammar-equation',
    },
    {
      variant: 'css-flashcard-flip',
      re: /\b(flashcard|vocab|definition|memorize|new word)\b/,
      category: 'vocab',
      icon: 'book',
      rule: 'css-flashcard-flip',
    },
    {
      variant: 'css-browser-mockup',
      re: /\b(website|browser|article|blog|online|url)\b/,
      category: 'life',
      icon: 'laptop',
      rule: 'css-browser-mockup',
    },
    {
      variant: 'bs-progress-meter',
      re: /\b(progress|percent|fluency|milestone|goal|mastery)\b/,
      category: 'vocab',
      icon: 'sparkles',
      rule: 'bs-progress-meter',
    },
    {
      variant: 'bs-alert-tip',
      re: /\b(warning|caution|avoid|careful|watch out|mistake)\b/,
      category: 'grammar',
      icon: 'lightning',
      rule: 'bs-alert-tip',
    },
    {
      variant: 'bs-accordion-faq',
      re: /\b(faq|why do|frequently asked|question)\b/,
      category: 'grammar',
      icon: 'brain',
      rule: 'bs-accordion-faq',
    },
    {
      variant: 'css-toggle-switch',
      re: /\b(switch|toggle|mode|upgrade)\b/,
      category: 'dialogue',
      icon: 'lightning',
      rule: 'css-toggle-switch',
    },
    {
      variant: 'css-glass-quote',
      re: /\b(quote|motto|proverb|takeaway|wisdom)\b/,
      category: 'dialogue',
      icon: 'heart',
      rule: 'css-glass-quote',
    },
    {
      variant: 'css-roadmap-steps',
      re: /\b(three steps|step 1|method|process)\b/,
      category: 'grammar',
      icon: 'walk',
      rule: 'css-roadmap-steps',
    },
    {
      variant: 'css-bento-stats',
      re: /\b(bento|breakdown|summary|overview)\b/,
      category: 'vocab',
      icon: 'sparkles',
      rule: 'css-bento-stats',
    },
    {
      variant: 'css-sticky-note',
      re: /\b(golden rule|don't forget|quick note|sticky note|rule of thumb)\b/,
      category: 'grammar',
      icon: 'pencil',
      rule: 'css-sticky-note',
    },
    {
      variant: 'bs-badge-cluster',
      re: /\b(synonym|other ways|instead of|alternatives|collocation)\b/,
      category: 'vocab',
      icon: 'sparkles',
      rule: 'bs-badge-cluster',
    },
    {
      variant: 'css-magnifying-word',
      re: /\b(closer look|nuance|focus on|spotlight)\b/,
      category: 'vocab',
      icon: 'eye',
      rule: 'css-magnifying-word',
    },
    {
      variant: 'bs-modal-quiz',
      re: /\b(quick check|pop quiz|pick the best|choose one)\b/,
      category: 'dialogue',
      icon: 'brain',
      rule: 'bs-modal-quiz',
    },
    {
      variant: 'p168-step-quiz-formula',
      re: /\b(lend|borrow|fill in the blank|question 1|word choice)\b/,
      category: 'grammar',
      icon: 'brain',
      rule: 'p168-step-quiz-formula',
    },
    {
      variant: 'p168-grammar-formula',
      re: /\b(used to|be used to|get used to|grammar formula|sentence structure)\b/,
      category: 'grammar',
      icon: 'book',
      rule: 'p168-grammar-formula',
    },
    {
      variant: 'p168-pronunciation-matrix',
      re: /\b(t sound|d sound|id sound|ending sound|worked|played|waited|voiced|voiceless)\b/,
      category: 'pronunciation',
      icon: 'mic',
      rule: 'p168-pronunciation-matrix',
    },
    {
      variant: 'p168-situation-cards',
      re: /\b(with friends|at work|say no|softly|casual vs formal|polite refusal)\b/,
      category: 'dialogue',
      icon: 'handshake',
      rule: 'p168-situation-cards',
    },
    {
      variant: 'p168-slider-compare',
      re: /\b(past simple|present perfect|how to choose|difference between)\b/,
      category: 'grammar',
      icon: 'scale',
      rule: 'p168-slider-compare',
    },
    {
      variant: 'p168-story-dialogue',
      re: /\b(roommate|leans in|short story|story time|what happened)\b/,
      category: 'dialogue',
      icon: 'chat',
      rule: 'p168-story-dialogue',
    },
  ];
  for (const chk of uiChecks) {
    if (chk.re.test(t)) {
      return {
        variant: chk.variant,
        sceneIcon: chk.icon,
        category: chk.category,
        matchedRule: chk.rule,
        data: {
          title: cleanSnippet(cardText || cueText, 28),
          subtitle: cleanSnippet(cueText, 36),
          speechText: cleanSnippet(cardText || cueText, 36),
          sceneIcon: chk.icon,
        },
      };
    }
  }

  // 5. General fallback still picks a context-matched dynamic-scene hero when meaningful icon matched
  if (icon !== 'chat' && fallbackVariant === 'dynamic-scene') {
    const dynamicMotifs: DynamicSceneMotif[] = [
      {
        icon,
        label: cleanSnippet(cardText || cueText, 22),
        accent: '#4F46E5',
        status: /rude|wrong|don't|stop/i.test(t) ? 'cross' : 'check',
      },
    ];
    return {
      variant: 'dynamic-scene',
      sceneIcon: icon,
      category: 'dialogue',
      matchedRule: `dynamic-hero-${icon}`,
      data: {
        sceneIcon: icon,
        dynamicScene: {
          layout: 'hero-icon-formula',
          badgeText: 'KEY CONTEXT',
          headline: cleanSnippet(cardText || cueText, 26),
          motifs: dynamicMotifs,
        },
      },
    };
  }

  return {
    variant: fallbackVariant,
    sceneIcon: icon,
    category: 'dialogue',
    matchedRule: 'fallback',
    data: { sceneIcon: icon },
  };
}

export function getCatalogSummaryForPrompt(): {
  variantsListText: string;
  sceneIconsListText: string;
} {
  const effective = getEffectiveVectorCatalog();
  const variantsListText = effective
    .map(
      (c) =>
        `     + "${c.variant}" (${c.label}${c.isCustom ? ' [Tùy chỉnh]' : ''}): ${c.description}`,
    )
    .join('\n');

  const sceneIconsListText = SCENE_ICON_KEYWORDS.map((s) => `"${s.icon}"`).join(', ');
  return { variantsListText, sceneIconsListText };
}

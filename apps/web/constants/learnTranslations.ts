import { Language } from "~~/stores/useLanguageStore";

export const learnTranslations: Record<Language, any> = {
  en: {
    title: "Learn",
    lessons: "Lessons",
    back_to_learn: "Back to Learn",
    open_article: "Open Article",
    poker_basics: {
      title: "Poker Basics",
      description: "Learn the flow of Texas Hold'em, the betting rounds, and how hands are built from hole cards and community cards.",
      sections: [
        {
          title: "What is Texas Hold'em?",
          body: "Texas Hold'em is a community-card poker game. Each player receives two private hole cards, and five community cards are dealt face up. You make your best five-card hand using any combination of your two hole cards and the five community cards.",
        },
        {
          title: "Hand Flow (One Full Hand)",
          body: "A hand moves through four betting rounds: preflop (after hole cards), flop (three community cards), turn (fourth card), and river (fifth card). Each round continues until all active players have matched the current bet. If everyone checks or folds, the hand ends.",
          bullets: [
            "Preflop: hole cards dealt, blinds posted, first betting round.",
            "Flop: three community cards dealt, betting round.",
            "Turn: fourth community card, betting round.",
            "River: fifth community card, final betting round.",
          ],
        },
        {
          title: "Actions You Can Take",
          body: "On your turn you can fold, check (if no bet is in front of you), call (match the bet), bet (start the action), or raise (increase the bet). Your options depend on the current bet and your stack.",
          bullets: [
            "Fold: give up your hand and lose what you’ve already put in.",
            "Check: pass the action when no bet is required.",
            "Call: match the current bet to stay in.",
            "Bet: place the first bet on a street.",
            "Raise: increase the bet size; others must call or fold.",
          ],
        },
        {
          title: "Blinds, Antes, and Position",
          body: "Blinds force action and create the pot. The dealer button rotates each hand; the player left of the button posts the small blind, the next posts the big blind. Acting later (closer to the button) is stronger because you see opponents act first. Some games add antes, small forced bets from everyone.",
        },
        {
          title: "Hand Rankings (Strongest → Weakest)",
          body: "Royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. If two players have the same hand rank, the highest card in the hand breaks the tie (kickers).",
          bullets: [
            "Flush vs. straight: a flush is any five cards of the same suit; a straight is five in sequence.",
            "Full house: three of a kind + a pair.",
            "Kickers: extra cards that break ties when hand ranks match.",
          ],
        },
        {
          title: "Showdown and Winning the Pot",
          body: "If more than one player remains after the river, the hand goes to showdown. Players reveal their cards, and the best five-card hand wins. You can also win without showdown by betting and getting everyone to fold.",
        },
        {
          title: "Quick Tips for Your First Sessions",
          body: "Play tighter from early position, avoid big bluffs at low stakes, and focus on simple value betting. Watch how opponents play and take notes—most mistakes come from playing too many weak hands.",
        },
      ]
    },
    basic_strategy: {
      title: "Basic Strategy",
      description: "Build a tight, disciplined baseline: position-first, bet for value, and minimize costly mistakes.",
      sections: [
        {
          title: "Play Tight From Early Position",
          body: "Your default strategy should be selective. Early position is the hardest seat because you act first after the flop. Choose stronger hands early and open up slightly as you move closer to the button.",
          bullets: [
            "Early position: premium pairs, strong aces, strong broadways.",
            "Middle position: add suited aces and more broadways.",
            "Late position: widen to include suited connectors and more speculative hands.",
          ],
        },
        {
          title: "Value Bet First, Bluff Second",
          body: "Most profit at lower and mid stakes comes from clear value bets. When you have a hand likely ahead of your opponent’s range, bet for value. Bluff only when the story makes sense and the board favors your range.",
          bullets: [
            "Bet bigger when the board is wet and draws are present.",
            "Bet smaller on dry boards when you want calls from weaker hands.",
            "Bluff less against players who don’t fold.",
          ],
        },
        {
          title: "Use Position to Control Pot Size",
          body: "Position is power. Acting last lets you see how opponents behave before you decide. You can take free cards, keep pots small with marginal hands, or apply pressure when opponents show weakness.",
        },
        {
          title: "Have a Simple Preflop Plan",
          body: "Avoid limping. Open-raise or fold. If someone raises, decide whether to 3-bet or fold based on your hand strength and position. Keep your range consistent so opponents can’t read you easily.",
          bullets: [
            "Open-raise to isolate and take initiative.",
            "3-bet for value with strong hands; bluff 3-bet sparingly.",
            "Fold marginal hands out of position to avoid tough spots.",
          ],
        },
        {
          title: "Think in Ranges, Not Single Hands",
          body: "Assign your opponent a range based on their position, bet sizing, and past actions. Then compare your hand to that range instead of guessing one exact hand.",
        },
        {
          title: "Plan One Street Ahead",
          body: "Before you bet or call, think about what you’ll do on the next card. If a turn card could freeze you or force a fold, you may be better off taking a different line now.",
        },
        {
          title: "Avoid Common Leaks",
          body: "Most beginners lose chips by playing too many hands, calling too often, and ignoring position. A disciplined fold saves far more chips than a hopeful call.",
          bullets: [
            "Don’t chase weak draws without the right price.",
            "Respect big bets on the river—they’re usually value.",
            "Stay calm after losing a hand; avoid tilt decisions.",
          ],
        },
      ]
    },
    player_types: {
      title: "Player Types",
      description: "Identify common table archetypes and adjust with simple counter-plans.",
      sections: [
        {
          title: "Tight-Passive",
          body: "Plays few hands and rarely raises. Value bet thinner and avoid bluffing; they usually have it when they show aggression.",
        },
        {
          title: "Tight-Aggressive",
          body: "Selective but assertive. Respect their raises, but fight back in position with strong hands and well-timed 3-bets.",
        },
        {
          title: "Loose-Passive",
          body: "Calls too much and chases. Bet bigger for value and reduce fancy bluffs—make them pay to see cards.",
        },
        {
          title: "Loose-Aggressive",
          body: "Applies pressure and plays many hands. Trap with strong holdings and use position to call down lighter when ranges are wide.",
        },
      ]
    },
    hand_range: {
      title: "Hand Range",
      description: "Think in ranges instead of single hands. Start with broad ranges and tighten as action progresses.",
      sections: [
        {
          title: "What Is a Range?",
          body: "A range is the set of hands someone could have given their position and actions. It's more accurate than guessing a single hand.",
        },
        {
          title: "Start Broad, Then Narrow",
          body: "Preflop ranges are widest. Each bet or raise narrows possibilities. By the river, ranges can be very tight.",
        },
        {
          title: "Think in Buckets",
          body: "Group hands into categories: strong value, medium value, draws, and bluffs. Decide which buckets take which actions.",
        },
        {
          title: "Position Matters",
          body: "Ranges are tighter out of position and wider in late position. Use this to interpret bets and size decisions.",
        },
      ]
    },
    tournament: {
      title: "Tournament",
      description: "Manage stack sizes, understand payout pressure, and adjust aggression as blinds rise.",
      sections: [
        {
          title: "Stack Depth Awareness",
          body: "Your effective stack (in big blinds) drives strategy. Deep stacks favor post-flop skill; short stacks push toward preflop decisions.",
        },
        {
          title: "Blind Pressure",
          body: "As blinds rise, hands that were playable become folds. Stay ahead of the curve by stealing blinds in late position.",
        },
        {
          title: "ICM and Payouts",
          body: "Near the money or final table, chips are worth more than usual. Avoid marginal all-ins and prioritize survival when payouts jump.",
        },
        {
          title: "Adjust to Table Dynamics",
          body: "Exploit tight tables with more opens; tighten up against aggressive tables. Always note stack sizes behind you.",
        },
      ]
    }
  },
  ko: {
    title: "학습",
    lessons: "레슨",
    back_to_learn: "학습 목록으로 돌아가기",
    open_article: "문서 열기",
    poker_basics: {
      title: "포커 기초",
      description: "텍사스 홀덤의 흐름, 베팅 라운드, 홀 카드와 커뮤니티 카드로 족보를 만드는 법을 배웁니다.",
      sections: [
        {
          title: "텍사스 홀덤이란 무엇인가요?",
          body: "텍사스 홀덤은 커뮤니티 카드를 사용하는 포커 게임입니다. 각 플레이어는 두 장의 비공개 홀 카드를 받고, 다섯 장의 커뮤니티 카드가 앞면이 보이게 놓입니다. 두 장의 홀 카드와 다섯 장의 커뮤니티 카드를 조합하여 가장 좋은 다섯 장의 핸드를 만듭니다.",
        },
        {
          title: "핸드 진행 방식 (한 판의 흐름)",
          body: "한 핸드는 네 번의 베팅 라운드를 거칩니다: 프리플랍(홀 카드를 받은 후), 플랍(커뮤니티 카드 세 장), 턴(네 번째 카드), 리버(다섯 번째 카드). 각 라운드는 모든 활성 플레이어가 현재 베팅 금액을 맞출 때까지 계속됩니다. 모든 플레이어가 체크하거나 폴드하면 핸드가 종료됩니다.",
          bullets: [
            "프리플랍: 홀 카드가 분배되고, 블라인드를 게시하며, 첫 번째 베팅 라운드가 진행됩니다.",
            "플랍: 세 장의 커뮤니티 카드가 놓이고, 베팅 라운드가 진행됩니다.",
            "턴: 네 번째 커뮤니티 카드가 놓이고, 베팅 라운드가 진행됩니다.",
            "리버: 다섯 번째 커뮤니티 카드가 놓이고, 마지막 베팅 라운드가 진행됩니다.",
          ],
        },
        {
          title: "가능한 액션",
          body: "본인의 차례에 폴드, 체크(베팅이 없는 경우), 콜(베팅 금액 맞추기), 벳(액션 시작), 또는 레이즈(베팅 금액 높이기)를 할 수 있습니다. 옵션은 현재 베팅 상황과 본인의 스택에 따라 달라집니다.",
          bullets: [
            "폴드: 핸드를 포기하고 이미 낸 금액을 잃습니다.",
            "체크: 베팅이 필요 없을 때 차례를 넘깁니다.",
            "콜: 현재 베팅 금액을 맞춰서 게임을 계속합니다.",
            "벳: 해당 스트리트에서 첫 번째 베팅을 합니다.",
            "레이즈: 베팅 크기를 늘립니다. 다른 사람들은 콜하거나 폴드해야 합니다.",
          ],
        },
        {
          title: "블라인드, 안티, 그리고 포지션",
          body: "블라인드는 액션을 강제하고 팟을 만듭니다. 딜러 버튼은 매 핸드 회전하며, 버튼 왼쪽 플레이어는 스몰 블라인드, 그다음 플레이어는 빅 블라인드를 게시합니다. 나중에 액션을 취할수록(버튼에 가까울수록) 상대방의 액션을 먼저 볼 수 있어 유리합니다. 일부 게임에는 모든 플레이어가 내는 강제 베팅인 안티가 추가됩니다.",
        },
        {
          title: "핸드 순위 (강함 → 약함)",
          body: "로열 플러시, 스트레이트 플러시, 포 오브 어 카인드(포카드), 풀하우스, 플러시, 스트레이트, 쓰리 오브 어 카인드(트리플), 투 페어, 원 페어, 하이 카드. 두 플레이어가 같은 핸드 순위를 가진 경우, 핸드에서 가장 높은 카드가 승부를 가립니다(키커).",
          bullets: [
            "플러시 vs 스트레이트: 플러시는 같은 문양의 카드 다섯 장이며, 스트레이트는 연속된 숫자 다섯 장입니다.",
            "풀하우스: 쓰리 오브 어 카인드 + 원 페어.",
            "키커: 핸드 순위가 같을 때 승부를 가리는 나머지 카드들입니다.",
          ],
        },
        {
          title: "쇼다운과 팟 승리",
          body: "리버 이후에 두 명 이상의 플레이어가 남아 있으면 쇼다운으로 이동합니다. 플레이어는 카드를 공개하고 가장 좋은 다섯 장의 핸드가 승리합니다. 또한 베팅을 통해 모든 상대를 폴드시켜 쇼다운 없이 승리할 수도 있습니다.",
        },
        {
          title: "첫 세션을 위한 퀵 팁",
          body: "초반 포지션에서는 타이트하게 플레이하고, 낮은 판돈에서는 큰 블러핑을 피하며, 단순한 밸류 베팅에 집중하세요. 상대방이 어떻게 플레이하는지 관찰하고 메모하세요. 대부분의 실수는 너무 많은 약한 핸드로 플레이하는 것에서 나옵니다.",
        },
      ]
    },
    basic_strategy: {
      title: "기본 전략",
      description: "타이트하고 절제된 기준을 세우세요: 포지션 우선, 가치 베팅, 그리고 치명적인 실수를 최소화하세요.",
      sections: [
        {
          title: "초반 포지션에서는 타이트하게 플레이하세요",
          body: "기본 전략은 선택적이어야 합니다. 초반 포지션은 플랍 이후 가장 먼저 액션을 취해야 하므로 가장 어려운 자리입니다. 초반에는 강한 핸드를 선택하고 버튼에 가까워질수록 범위를 약간 넓히세요.",
          bullets: [
            "초반 포지션: 프리미엄 페어, 강한 에이스, 강한 브로드웨이 카드.",
            "중간 포지션: 수티드 에이스와 더 많은 브로드웨이 카드 추가.",
            "후반 포지션: 수티드 커넥터와 투기적인 핸드까지 범위 확대.",
          ],
        },
        {
          title: "가치 베팅을 우선하고, 블러핑은 나중에",
          body: "낮은 판돈에서의 대부분의 수익은 명확한 가치 베팅에서 나옵니다. 상대방의 범위보다 앞서 있을 가능성이 높을 때 가치 베팅을 하세요. 이야기가 앞뒤가 맞고 보드가 본인의 범위에 유리할 때만 블러핑을 하세요.",
          bullets: [
            "보드에 드로우 가능성이 많을 때는 더 크게 베팅하세요.",
            "약한 핸드의 콜을 유도하고 싶을 때는 마른 보드에서 작게 베팅하세요.",
            "폴드하지 않는 플레이어를 상대로는 블러핑을 줄이세요.",
          ],
        },
        {
          title: "포지션을 활용해 팟 크기를 조절하세요",
          body: "포지션은 힘입니다. 마지막에 액션을 취하면 상대방이 어떻게 행동하는지 보고 결정할 수 있습니다. 무료 카드를 보거나, 애매한 핸드로 팟을 작게 유지하거나, 상대방이 약점을 보일 때 압박을 가할 수 있습니다.",
        },
        {
          title: "단순한 프리플랍 계획을 가지세요",
          body: "림핑을 피하세요. 오픈 레이즈하거나 폴드하세요. 누군가 레이즈했다면 본인의 핸드 강도와 포지션에 따라 3벳할지 폴드할지 결정하세요. 상대방이 본인을 쉽게 읽지 못하도록 일관된 범위를 유지하세요.",
          bullets: [
            "상대를 고립시키고 주도권을 잡기 위해 오픈 레이즈하세요.",
            "강한 핸드로 가치를 위해 3벳하고, 블러핑 3벳은 아껴서 사용하세요.",
            "어려운 상황을 피하기 위해 포지션이 안 좋을 때는 애매한 핸드를 폴드하세요.",
          ],
        },
        {
          title: "단일 핸드가 아닌 레인지로 생각하세요",
          body: "상대방의 포지션, 베팅 크기, 과거 액션을 바탕으로 상대에게 범위를 할당하세요. 그런 다음 정확한 한 장의 핸드를 추측하는 대신 본인의 핸드를 그 범위와 비교하세요.",
        },
        {
          title: "한 단계 앞을 내다보세요",
          body: "베팅하거나 콜하기 전에 다음 카드에서 무엇을 할지 생각하세요. 턴 카드가 본인을 곤란하게 만들거나 폴드를 강제할 수 있다면, 지금 다른 선택을 하는 것이 나을 수 있습니다.",
        },
        {
          title: "흔한 실수를 피하세요",
          body: "대부분의 초보자는 너무 많은 핸드를 플레이하고, 너무 자주 콜하며, 포지션을 무시하여 칩을 잃습니다. 절제된 폴드는 희망적인 콜보다 훨씬 많은 칩을 아껴줍니다.",
          bullets: [
            "적절한 가격이 아닐 때는 약한 드로우를 쫓지 마세요.",
            "리버에서의 큰 베팅을 존중하세요. 보통은 가치 베팅입니다.",
            "핸드에서 진 후에도 평정심을 유지하세요. 틸트 상태에서의 결정을 피하세요.",
          ],
        },
      ]
    },
    player_types: {
      title: "플레이어 유형",
      description: "일반적인 테이블 아키타입을 식별하고 간단한 대응 계획으로 조정하세요.",
      sections: [
        {
          title: "타이트-패시브 (Tight-Passive)",
          body: "적은 수의 핸드만 플레이하며 좀처럼 레이즈하지 않습니다. 가치 베팅을 더 얇게(thin) 가져가고 블러핑을 피하세요. 그들이 공격성을 보인다면 대개 강한 핸드를 가지고 있다는 뜻입니다.",
        },
        {
          title: "타이트-어그레시브 (Tight-Aggressive)",
          body: "선택적이지만 단호합니다. 그들의 레이즈를 존중하되, 강한 핸드와 적절한 타이밍의 3벳으로 유리한 포지션에서 맞서 싸우세요.",
        },
        {
          title: "루즈-패시브 (Loose-Passive)",
          body: "너무 많이 콜하고 드로우를 쫓습니다. 가치를 위해 더 크게 베팅하고 화려한 블러핑은 줄이세요. 카드를 보는 대가를 치르게 만드세요.",
        },
        {
          title: "루즈-어그레시브 (Loose-Aggressive)",
          body: "압박을 가하며 많은 핸드를 플레이합니다. 강한 핸드로 함정을 파고, 상대의 범위가 넓을 때 포지션을 활용해 더 가볍게 콜 다운하세요.",
        },
      ]
    },
    hand_range: {
      title: "핸드 레인지",
      description: "단일 핸드가 아닌 레인지로 생각하세요. 넓은 레인지로 시작하여 액션이 진행됨에 따라 좁혀 나가세요.",
      sections: [
        {
          title: "레인지란 무엇인가요?",
          body: "레인지는 상대방의 포지션과 액션을 고려했을 때 가질 수 있는 핸드의 집합입니다. 단일 핸드를 추측하는 것보다 훨씬 정확합니다.",
        },
        {
          title: "넓게 시작해서 좁혀가기",
          body: "프리플랍 레인지가 가장 넓습니다. 각 베팅이나 레이즈가 가능성을 좁힙니다. 리버에 이르면 레인지가 매우 좁아질 수 있습니다.",
        },
        {
          title: "카테고리별로 생각하기",
          body: "핸드를 그룹화하세요: 강한 가치, 중간 가치, 드로우, 그리고 블러핑. 어떤 그룹이 어떤 액션을 취할지 결정하세요.",
        },
        {
          title: "포지션의 중요성",
          body: "포지션이 안 좋을 때는 레인지가 좁아지고, 후반 포지션에서는 넓어집니다. 이를 이용해 상대의 베팅을 해석하고 크기를 결정하세요.",
        },
      ]
    },
    tournament: {
      title: "토너먼트",
      description: "스택 크기를 관리하고, 페이아웃 압박을 이해하며, 블라인드가 상승함에 따라 공격성을 조정하세요.",
      sections: [
        {
          title: "스택 깊이 인지",
          body: "본인의 유효 스택(빅 블라인드 단위)이 전략을 결정합니다. 딥 스택은 플랍 이후의 기술이 중요하며, 숏 스택은 프리플랍 결정으로 이어집니다.",
        },
        {
          title: "블라인드 압박",
          body: "블라인드가 오르면 플레이 가능했던 핸드들도 폴드해야 합니다. 후반 포지션에서 블라인드 스틸을 통해 흐름보다 앞서 나가세요.",
        },
        {
          title: "ICM과 페이아웃",
          body: "머니인(Money-in) 구간이나 파이널 테이블 근처에서는 칩의 가치가 평소보다 높습니다. 애매한 올인을 피하고 페이아웃이 점프하는 구간에서는 생존을 우선시하세요.",
        },
        {
          title: "테이블 다이내믹에 적응하기",
          body: "타이트한 테이블에서는 더 자주 오픈하고, 공격적인 테이블에서는 더 타이트하게 플레이하세요. 항상 본인 뒤에 있는 플레이어들의 스택 크기를 확인하세요.",
        },
      ]
    }
  },
  ja: {
    title: "学ぶ",
    lessons: "レッスン",
    back_to_learn: "学習一覧に戻る",
    open_article: "記事を開く",
    poker_basics: {
      title: "ポーカーの基本",
      description: "テキサスホールデムの流れ、ベッティングラウンド、ホールカードとコミュニティカードからのハンドの作り方を学びます。",
      sections: [
        {
          title: "テキサスホールデムとは？",
          body: "テキサスホールデムはコミュニティカードを使用するポーカーゲームです。各プレイヤーは2枚の伏せられたホールカードを受け取り、5枚のコミュニティカードが表向きに配られます。2枚のホールカードと5枚のコミュニティカードを組み合わせて、最高の5枚のハンドを作ります。",
        },
        {
          title: "ハンドの流れ（1ハンドの流れ）",
          body: "1つのハンドは4つのベッティングラウンドを経て進みます：プリフロップ（ホールカードの後）、フロップ（3枚のコミュニティカード）、ターン（4枚目のカード）、リバー（5枚目のカード）。各ラウンドは、すべての現役プレイヤーが現在のベット額に合わせるまで続きます。全員がチェックまたはフォールドした場合、ハンドは終了します。",
          bullets: [
            "プリフロップ：ホールカードが配られ、ブラインドが支払われ、最初のベッティングラウンドが行われます。",
            "フロップ：3枚のコミュニティカードが配られ、ベッティングラウンドが行われます。",
            "ターン：4枚目のコミュニティカード、ベッティングラウンド。",
            "リバー：5枚目のコミュニティカード、最終ベッティングラウンド。",
          ],
        },
        {
          title: "実行できるアクション",
          body: "自分の番が来たら、フォールド、チェック（ベットがない場合）、コール（ベットに合わせる）、ベット（アクションを開始する）、またはレイズ（ベット額を増やす）ができます。選択肢は現在のベット状況と自分のスタックによって決まります。",
          bullets: [
            "フォールド：ハンドを諦め、すでに投入したチップを失います。",
            "チェック：ベットが必要ない場合に番をパスします。",
            "コール：現在のベット額に合わせてゲームに残ります。",
            "ベット：そのストリートで最初のベットを行います。",
            "レイズ：ベットサイズを増やします。他の人はコールするかフォールドしなければなりません。",
          ],
        },
        {
          title: "ブラインド、アンティ、ポジション",
          body: "ブラインドはアクションを強制し、ポットを作ります。ディーラーボタンは毎ハンド回転します。ボタンの左のプレイヤーがスモールブラインドを、次のプレイヤーがビッグブラインドを支払います。後でアクションを行う（ボタンに近い）ほど、相手のアクションを先に確認できるため有利になります。一部のゲームでは、全員が支払う強制ベットであるアンティが追加されます。",
        },
        {
          title: "ハンドの強さ（強 → 弱）",
          body: "ロイヤルフラッシュ、ストレートフラッシュ、フォー・オブ・ア・カインド、フルハウス、フラッシュ、ストレート、スリー・オブ・ア・カインド、ツーペア、ワンペア、ハイカード。2人のプレイヤーが同じ役の場合、ハンド内の最も高いカードが勝敗を決めます（キッカー）。",
          bullets: [
            "フラッシュ vs ストレート：フラッシュは同じスートの任意の5枚。ストレートは連続した5枚です。",
            "フルハウス：スリー・オブ・ア・カインド ＋ ワンペア。",
            "キッカー：役が同じ場合に勝敗を決める残りのカードです。",
          ],
        },
        {
          title: "ショウダウンとポットの獲得",
          body: "リバーの後に2人以上のプレイヤーが残っている場合、ショウダウンになります。プレイヤーはカードを公開し、最高の5枚のハンドが勝利します。また、ベットして全員をフォールドさせることで、ショウダウンなしで勝つこともできます。",
        },
        {
          title: "最初のセッションのためのクイックヒント",
          body: "早いポジションからはタイトにプレイし、低レートでの大きなブラフは避け、シンプルなバリューベットに集中しましょう。相手のプレイを観察してメモを取りましょう。ほとんどのミスは、弱いハンドをプレイしすぎることから生じます。",
        },
      ]
    },
    basic_strategy: {
      title: "基本戦略",
      description: "タイトで規律あるベースラインを構築しましょう：ポジション重視、バリューベット、そして手痛いミスを最小限に抑えます。",
      sections: [
        {
          title: "アーリーポジションからはタイトにプレイする",
          body: "デフォルトの戦略は選択的であるべきです。アーリーポジションはフロップ後に最初のアクションを行う必要があるため、最も難しい席です。早い段階では強いハンドを選び、ボタンに近づくにつれて少しずつ広げていきましょう。",
          bullets: [
            "アーリーポジション：プレミアムペア、強いエース、強いブロードウェイカード。",
            "ミドルポジション：スーテッドエースや他のブロードウェイカードを追加。",
            "レイトポジション：スーテッドコネクターや投機的なハンドまで広げる。",
          ],
        },
        {
          title: "バリューベットを優先し、ブラフは二の次",
          body: "低・中レートでの利益の多くは、明確なバリューベットから生まれます。相手のレンジよりも勝っている可能性が高いときは、バリューのためにベットしましょう。ブラフは、ストーリーに矛盾がなく、ボードが自分のレンジに有利なときだけ行いましょう。",
          bullets: [
            "ボードにドローの可能性があるときは大きくベットする。",
            "ドライなボードで弱いハンドのコールを誘いたいときは小さくベットする。",
            "フォールドしないプレイヤーに対してはブラフを控える。",
          ],
        },
        {
          title: "ポジションを使ってポットサイズをコントロールする",
          body: "ポジションは力です。最後にアクションを行うことで、相手の出方を見てから決めることができます。フリーカードをもらったり、微妙なハンドでポットを小さく保ったり、相手が弱みを見せたときにプレッシャーをかけたりできます。",
        },
        {
          title: "シンプルなプリフロッププランを持つ",
          body: "リンプ（コールで参加すること）は避けましょう。オープンレイズするかフォールドします。誰かがレイズした場合は、自分のハンドの強さとポジションに基づいて、3ベットするかフォールドするかを決めます。相手に読み取られないよう、一貫したレンジを保ちましょう。",
          bullets: [
            "相手を孤立させ、主導権を握るためにオープンレイズする。",
            "強いハンドでバリューのために3ベットする。ブラフ3ベットは慎重に。",
            "難しい状況を避けるため、ポジションが悪いときは微妙なハンドをフォールドする。",
          ],
        },
        {
          title: "単一のハンドではなくレンジで考える",
          body: "相手のポジション、ベットサイズ、過去のアクションに基づいて、相手にレンジを割り当てます。そして、特定の1つのハンドを当てるのではなく、自分のハンドをそのレンジと比較します。",
        },
        {
          title: "1つ先のストリートを計画する",
          body: "ベットやコールをする前に、次のカードが出たときにどうするかを考えましょう。ターンのカードによって自分が困ったりフォールドを強制されたりする可能性があるなら、今別の選択肢をとるほうが良いかもしれません。",
        },
        {
          title: "よくあるミス（リーク）を避ける",
          body: "初心者の多くは、多くのハンドをプレイしすぎ、コールしすぎ、ポジションを無視することでチップを失います。規律あるフォールドは、希望的観測に基づいたコールよりもはるかに多くのチップを救います。",
          bullets: [
            "適切な価格でない限り、弱いドローを追いかけない。",
            "リバーでの大きなベットを尊重する。通常はバリューベットです。",
            "ハンドを失った後も冷静さを保つ。ティルト状態での決断を避ける。",
          ],
        },
      ]
    },
    player_types: {
      title: "プレイヤータイプ",
      description: "一般的なテーブルの典型を特定し、簡単なカウンタープランで調整します。",
      sections: [
        {
          title: "タイト・パッシブ",
          body: "プレイするハンドが少なく、めったにレイズしません。バリューベットをより薄く（控えめに）行い、ブラフは避けましょう。彼らがアグレッション（攻撃性）を見せるときは、通常強いハンドを持っています。",
        },
        {
          title: "タイト・アグレッシブ",
          body: "選択的ですが、自己主張が強いです。彼らのレイズを尊重しつつ、強いハンドやタイミングの良い3ベットを使い、有利なポジションで戦いましょう。",
        },
        {
          title: "ルーズ・パッシブ",
          body: "コールしすぎてドローを追いかけます。バリューのために大きくベットし、派手なブラフは控えましょう。カードを見るための代償を払わせてください。",
        },
        {
          title: "ルーズ・アグレッシブ",
          body: "プレッシャーをかけ、多くのハンドをプレイします。強い持ち札で罠を仕掛け、相手のレンジが広いときはポジションを活かして軽めにコールダウンしましょう。",
        },
      ]
    },
    hand_range: {
      title: "ハンドレンジ",
      description: "単一のハンドではなくレンジで考えましょう。広いレンジから始め、アクションが進むにつれて絞り込んでいきます。",
      sections: [
        {
          title: "レンジとは？",
          body: "レンジとは、ポジションやアクションから判断して、相手が持っている可能性のあるハンドの集合のことです。特定の1つのハンドを推測するよりも正確です。",
        },
        {
          title: "広く始めて、徐々に絞る",
          body: "プリフロップのレンジが最も広いです。ベットやレイズが行われるたびに可能性が絞られます。リバーまでには、レンジは非常にタイトになることがあります。",
        },
        {
          title: "カテゴリー（バケツ）で考える",
          body: "ハンドをグループに分けましょう：強いバリュー、中程度のバリュー、ドロー、そしてブラフ。どのカテゴリーでどのアクションをとるかを決めます。",
        },
        {
          title: "ポジションの重要性",
          body: "ポジションが悪いときはレンジが狭くなり、レイトポジションでは広くなります。これを利用して相手のベットを解釈し、サイズを決定しましょう。",
        },
      ]
    },
    tournament: {
      title: "トーナメント",
      description: "スタックサイズを管理し、ペイアウトのプレッシャーを理解し、ブラインドが上がるにつれてアグレッションを調整します。",
      sections: [
        {
          title: "スタックの深さの意識",
          body: "有効スタック（ビッグブラインド単位）が戦略を左右します。ディープスタックはポストフロップのスキルが重要になり、ショートスタックはプリフロップの決断へと向かわせます。",
        },
        {
          title: "ブラインドの圧力",
          body: "ブラインドが上がるにつれて、本来プレイ可能だったハンドもフォールドせざるを得なくなります。レイトポジションでのブラインドスチールを行い、時代の先を行きましょう。",
        },
        {
          title: "ICMとペイアウト",
          body: "入賞圏内やファイナルテーブル付近では、チップの価値が通常より高くなります。微妙なオールインを避け、ペイアウトが跳ね上がる場面では生存を優先しましょう。",
        },
        {
          title: "テーブルダイナミクスへの適応",
          body: "タイトなテーブルではより多くのオープンを使い、アグレッシブなテーブルに対してはタイトに構えましょう。常に後ろにいるプレイヤーのスタックサイズを確認してください。",
        },
      ]
    }
  },
  zh: {
    title: "学习",
    lessons: "课程",
    back_to_learn: "回到学习",
    open_article: "打开文章",
    poker_basics: {
      title: "德州扑克基础",
      description: "了解德州扑克的流程、投注轮次，以及如何从底牌和公共牌中组合出最佳牌型。",
      sections: [
        {
          title: "什么是德州扑克？",
          body: "德州扑克是一种公共牌扑克游戏。每位玩家收到两张私有的底牌，并有五张公共牌正面向上发出。你使用两张底牌和五张公共牌中的任意组合，凑出最好的五张牌型。",
        },
        {
          title: "牌局流程（一局完整的牌）",
          body: "一局牌经过四个投注轮次：翻牌前（发出底牌后）、翻牌圈（三张公共牌）、转牌圈（第四张牌）和河牌圈（第五张牌）。每一轮持续到所有活跃玩家都跟注当前金额。如果所有人都让牌或弃牌，牌局结束。",
          bullets: [
            "翻牌前：分发底牌，放置盲注，第一轮投注。",
            "翻牌圈：发出三张公共牌，一轮投注。",
            "转牌圈：发出第四张公共牌，一轮投注。",
            "河牌圈：发出第五张公共牌，最后一轮投注。",
          ],
        },
        {
          title: "你可以采取的操作",
          body: "轮到你时，你可以弃牌、让牌（如果没有人下注）、跟注（匹配下注金额）、下注（开始行动）或加注（增加下注金额）。你的选择取决于当前的下注情况和你的筹码量。",
          bullets: [
            "弃牌：放弃手牌，损失已投入的筹码。",
            "让牌：在不需要下注时将行动权交给下一位。",
            "跟注：匹配当前下注金额以留在局中。",
            "下注：在某一轮中进行第一次投注。",
            "加注：增加下注金额；其他人必须跟注或弃牌。",
          ],
        },
        {
          title: "盲注、前注和位置",
          body: "盲注强制触发行动并形成底池。庄家按钮每局旋转；按钮左侧的玩家放置小盲注，下一位放置大盲注。位置越靠后（越接近按钮）越有利，因为你可以先观察对手的操作。某些游戏会增加前注，即每人都要支付的小额强制投注。",
        },
        {
          title: "牌型大小（最强 → 最弱）",
          body: "皇家青龙、同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。如果两位玩家的牌型等级相同，则由牌中最大的单牌决出胜负（踢脚牌）。",
          bullets: [
            "同花 vs 顺子：同花是任意五张相同花色的牌；顺子是五张连续数字的牌。",
            "葫芦：三条 + 一对。",
            "踢脚牌：当牌型等级相同时，用于决出胜负的额外牌。",
          ],
        },
        {
          title: "摊牌与赢得底池",
          body: "如果河牌圈后仍有超过一名玩家，牌局进入摊牌阶段。玩家展示手牌，最好的五张组合获胜。你也可以通过下注迫使所有人弃牌，从而在不摊牌的情况下获胜。",
        },
        {
          title: "初次游戏的快速建议",
          body: "在靠前位置玩得更紧一些，避免在低盲注局进行大的诈唬，专注于简单的价值下注。观察对手如何打牌并做笔记——大多数错误源于玩了太多弱牌。",
        },
      ]
    },
    basic_strategy: {
      title: "基本策略",
      description: "建立稳健且自律的基础：位置优先、价值投注，并尽量减少代价高昂的错误。",
      sections: [
        {
          title: "在靠前位置玩得紧一些",
          body: "你的默认策略应该是选择性的。靠前位置是最难打的位置，因为你在翻牌后最先行动。在早期选择更强的手牌，并随着向按钮位移动而稍微放开范围。",
          bullets: [
            "靠前位置：大对子、强 A、强百老汇手牌。",
            "中间位置：增加同花 A 和更多百老汇手牌。",
            "靠后位置：扩大到包括同花连张和更多投机性手牌。",
          ],
        },
        {
          title: "价值下注优先，诈唬次之",
          body: "在中低盲注局，大部分利润来自清晰的价值下注。当你认为自己的手牌很可能领先于对手的范围时，进行价值下注。只有在逻辑通顺且牌面对你的范围有利时才进行诈唬。",
          bullets: [
            "当牌面湿润且存在听牌可能时，下注更大一些。",
            "在干燥牌面上，如果你想诱使更弱的手牌跟注，下注小一些。",
            "针对不弃牌的玩家减少诈唬。",
          ],
        },
        {
          title: "利用位置控制底池大小",
          body: "位置就是力量。最后行动让你在决定前先观察对手的表现。你可以获取免费牌，用边际手牌保持小底池，或者在对手表现出软弱时施加压力。",
        },
        {
          title: "有一个简单的翻牌前计划",
          body: "避免平跟入池。加注进入或弃牌。如果有人加注，根据你的手牌强度和位置决定是 3-bet 还是弃牌。保持你的范围一致，让对手不容易读懂你。",
          bullets: [
            "加注进入以隔离对手并夺取主动权。",
            "用强牌进行价值 3-bet；谨慎进行诈唬 3-bet。",
            "在位置不利时弃掉边际手牌，以避免陷入困境。",
          ],
        },
        {
          title: "以“范围”而非单一手牌来思考",
          body: "根据对手的位置、下注大小和过去的行动给对手分配一个范围。然后将你的手牌与该范围进行比较，而不是猜测对方具体的一张手牌。",
        },
        {
          title: "提前计划一轮",
          body: "在下注或跟注之前，思考下一张牌发出时你会怎么做。如果转牌可能会让你陷入僵局或被迫弃牌，你现在最好采取不同的打法。",
        },
        {
          title: "避免常见的漏洞",
          body: "大多数初学者因为玩太多手牌、跟注太多以及忽略位置而输掉筹码。一次自律的弃牌比一次充满希望的跟注能省下多得多的筹码。",
          bullets: [
            "不要在赔率不合适时追弱听牌。",
            "尊重河牌圈的大额下注——它们通常是价值下注。",
            "输掉一手牌后保持冷静；避免在情绪失控（Tilt）下做决定。",
          ],
        },
      ]
    },
    player_types: {
      title: "玩家类型",
      description: "识别常见的牌局原型，并使用简单的应对方案进行调整。",
      sections: [
        {
          title: "紧弱型 (Tight-Passive)",
          body: "玩的牌很少，且很少加注。进行更薄的价值下注并避免诈唬；当他们表现出进攻性时，通常真的有牌。",
        },
        {
          title: "紧强型 (Tight-Aggressive)",
          body: "有选择性但表现强势。尊重他们的加注，但在有位置优势时，用强牌和时机恰当的 3-bet 进行反击。",
        },
        {
          title: "松弱型 (Loose-Passive)",
          body: "跟注太多并喜欢追牌。为了价值下注更大一些，减少花哨的诈唬——让他们为看牌付出代价。",
        },
        {
          title: "松强型 (Loose-Aggressive)",
          body: "施加压力且玩的牌很多。用强牌设陷阱，并在对方范围较广时利用位置进行更轻的跟注。",
        },
      ]
    },
    hand_range: {
      title: "手牌范围",
      description: "以“范围”而非单一手牌来思考。从广泛的范围开始，并随着行动的进行而收窄。",
      sections: [
        {
          title: "什么是范围？",
          body: "范围是某人在给定其位置和行动的情况下可能拥有的所有手牌集合。这比猜测单一手牌更准确。",
        },
        {
          title: "从广到窄",
          body: "翻牌前的范围最广。每一次下注或加注都会缩小可能性。到河牌圈时，范围可能会变得非常窄。",
        },
        {
          title: "分类思考",
          body: "将手牌分组：强价值、中等价值、听牌和诈唬。决定哪些类别采取哪些行动。",
        },
        {
          title: "位置很重要",
          body: "在不利位置时范围更窄，在靠后位置时范围更广。利用这一点来解读下注并做出大小决策。",
        },
      ]
    },
    tournament: {
      title: "锦标赛",
      description: "管理筹码量，理解奖金压力，并随着盲注上涨调整攻击性。",
      sections: [
        {
          title: "筹码深度意识",
          body: "你的有效筹码（以大盲注计）驱动策略。深筹码有利于翻牌后技巧；短筹码则倾向于翻牌前决策。",
        },
        {
          title: "盲注压力",
          body: "随着盲注上涨，原本可以玩的手牌会变成弃牌。通过在靠后位置偷盲注来保持领先。",
        },
        {
          title: "ICM 和奖金分配",
          body: "在接近奖励圈或决赛桌时，筹码比平时更有价值。避免边际的全部投入（All-in），并在奖金跳跃时优先考虑生存。",
        },
        {
          title: "适应牌局动态",
          body: "在紧的桌子上多偷盲；面对激进的桌子则收紧范围。始终注意你身后玩家的筹码量。",
        },
      ]
    }
  }
};
// Hindi (Devanagari) and Hinglish (Hindi written in the English alphabet) practice texts.
//
// Hindi rules, so that every character is one key on a standard Windows/Linux "Hindi Traditional" (Inscript) keyboard:
//  - only letters, vowel signs, anusvara and virama (conjuncts are typed letter + virama + letter), no nukta letters
//    (so no ड़ ढ़ ज़ फ़ ...), no chandrabindu, no digits (Inscript turns digits into Devanagari digits), only ASCII . , ? " as punctuation.
// Hinglish is plain ASCII, so it works on any keyboard, including phones.

export const HINDI_WORDS = [
  'घर', 'जल', 'कल', 'आज', 'दिन', 'रात', 'नमक', 'फल', 'फूल', 'आम', 'चाय', 'दूध', 'खेल', 'गाना', 'पानी',
  'किताब', 'दोस्त', 'स्कूल', 'रास्ता', 'बादल', 'सूरज', 'तारा', 'मेला', 'कार', 'मौसम', 'सुबह', 'शाम',
  'बाजार', 'कलम', 'कमरा', 'दरवाजा', 'खेत', 'नदी', 'हवा', 'नाम', 'काम', 'भाई', 'बहन', 'माता', 'पिता',
  'छात्र', 'शिक्षक', 'चलो', 'रुको', 'देखो', 'सुनो', 'बोलो', 'लिखो', 'तेज', 'धीरे', 'जल्दी', 'अच्छा',
];

export const HINDI_MEDIUM = [
  'आज मौसम बहुत अच्छा है.',
  'मेरा दोस्त बहुत तेज टाइप करता है.',
  'हम स्कूल के बाद खेलने जाएंगे.',
  'कृपया दरवाजा खोल दीजिए.',
  'सुबह जल्दी उठना अच्छी आदत है.',
  'मैं रोज कहानी सुनता हूं.',
  'बाजार रविवार को जल्दी खुलता है.',
  'पानी पीने से शरीर स्वस्थ रहता है.',
  'रोज अभ्यास करना जरूरी है.',
  'हमारी कक्षा शुक्रवार को पार्क जाती है.',
  'क्या तुम मेरी चाबी ढूंढने में मदद करोगे?',
  'धीरे और लगातार चलने वाला जीतता है.',
  'अच्छी आदतें छोटे कदमों से शुरू होती हैं.',
  'अपना काम दो बार जांच लो.',
  'शाम को हम सब छत पर बैठते हैं.',
  'बारिश के बाद सब कुछ साफ दिखता है.',
  'मेरी बहन रोज सुबह गाना गाती है.',
  'कल हमारे स्कूल में खेल का दिन है.',
  'पुस्तकालय में चुप रहना चाहिए.',
  'नदी के किनारे ठंडी हवा चल रही है.',
];

export const HINDI_HARD = [
  'सही टाइपिंग तेज गति से ज्यादा जरूरी है, क्योंकि शांत मन से हाथ अपने आप तेज चलते हैं.',
  'हर सफल विद्यार्थी जानता है कि नियमित अभ्यास ही सबसे महत्वपूर्ण कुंजी है.',
  'परीक्षा से पहले सभी प्रश्नों को ध्यान से देखना चाहिए.',
  'हमारे शहर का पुस्तकालय हर सितंबर में पठन प्रतियोगिता आयोजित करता है.',
  'समय का सही उपयोग करने वाले लोग हमेशा आगे रहते हैं.',
  'कठिन शब्दों में जल्दबाजी मत करो, लय तुम्हें पार लगा देगी.',
  'मेहनत करने वाले विद्यार्थी अक्सर परिणाम में सबसे आगे रहते हैं.',
  'त्योहार के दिन पूरे बाजार में दीपक जगमगाते हैं.',
  'अच्छे इंजीनियर हर छोटी गलती को ध्यान से जांचते हैं.',
  'संघर्ष के बिना कोई भी सफलता स्थायी नहीं होती.',
  'धैर्य और अनुशासन हर विजेता की सबसे मजबूत ताकत हैं.',
  'जिज्ञासु यात्री यादें इकट्ठा करते हैं, सामान नहीं.',
  'बिना स्पष्ट योजना के प्रतिभाशाली टीमें भी समय गंवा देती हैं.',
  'सच्चा साहस वही है जब हाथ कांप रहे हों, तब भी अगला कदम उठाना.',
];

export const HINDI_EXPERT = [
  'प्रधानाचार्य ने घोषणा की कि प्रतियोगिता में सभी विद्यार्थी स्वतंत्र रूप से भाग लेंगे.',
  'क्या आपने कभी सोचा है कि निरंतर अभ्यास से उंगलियां कैसे अपने आप चलने लगती हैं?',
  'विज्ञान प्रदर्शनी में छात्रों ने सौर ऊर्जा से चलने वाले अनेक उपकरण प्रस्तुत किए.',
  'उसने कहा, "सफलता का रहस्य केवल परिश्रम, धैर्य और सही मार्गदर्शन में छिपा है."',
  'प्रत्येक कर्मचारी को कार्यालय के नियमों का सख्ती से पालन करना चाहिए.',
  'भारतीय संस्कृति की विविधता विश्वभर के पर्यटकों को आकर्षित करती है.',
  'सरकारी परीक्षाओं की तैयारी करने वाले अभ्यर्थी प्रतिदिन टाइपिंग का अभ्यास करते हैं.',
  'उद्यमी वही है जो असफलता से घबराता नहीं, बल्कि उससे सीख लेकर नया प्रयास करता है.',
  'अध्यक्ष महोदय ने सभी सदस्यों से अनुरोध किया कि वे बैठक में समय पर उपस्थित रहें.',
  'सामाजिक परिवर्तन तभी संभव है जब प्रत्येक नागरिक अपने कर्तव्यों को समझे.',
];

export const HINGLISH_WORDS = [
  'ghar', 'paani', 'chai', 'doston', 'khel', 'kitab', 'school', 'bhai', 'behen', 'aam', 'doodh', 'sadak',
  'gaadi', 'bazaar', 'mausam', 'subah', 'shaam', 'raat', 'din', 'aaj', 'kal', 'phool', 'chaand', 'suraj',
  'badal', 'nadi', 'pahad', 'mela', 'khana', 'roti', 'dal', 'chawal', 'cricket', 'mazaa', 'accha', 'sundar',
  'tez', 'dheere', 'jaldi', 'chalo', 'ruko', 'dekho', 'suno', 'bolo', 'likho', 'padho',
];

export const HINGLISH_MEDIUM = [
  'Aaj mausam bahut accha hai.',
  'Mera dost bahut tez type karta hai.',
  'School ke baad hum cricket khelenge.',
  'Kripya darwaza band kar dijiye.',
  'Subah jaldi uthna achhi aadat hai.',
  'Main roz kahani sunta hoon.',
  'Bazaar ravivaar ko jaldi khulta hai.',
  'Paani peene se sharir swasth rehta hai.',
  'Roz abhyas karna zaroori hai.',
  'Hamari class shukravaar ko park jaati hai.',
  'Kya tum meri chabi dhoondhne mein madad karoge?',
  'Dheere aur lagatar chalne wala jeetta hai.',
  'Achhi aadatein chhote kadmon se shuru hoti hain.',
  'Apna kaam do baar check kar lo.',
  'Shaam ko hum sab chhat par baithte hain.',
  'Barish ke baad sab kuch saaf dikhta hai.',
  'Meri behen roz subah gaana gaati hai.',
  'Kal hamare school mein khel ka din hai.',
  'Nadi ke kinare thandi hawa chal rahi hai.',
  'Chai ke saath samosa mil jaaye to maza aa jaata hai.',
];

export const HINGLISH_HARD = [
  'Sahi typing tez speed se zyada zaroori hai, kyunki shaant mann se haath apne aap tez chalte hain.',
  'Har safal vidyarthi jaanta hai ki niyamit abhyas hi sabse mahatvapurn kunji hai.',
  'Pariksha se pehle sabhi prashnon ko dhyaan se dekhna chahiye.',
  'Hamare shehar ka pustakalay har September mein padhne ki pratiyogita karta hai.',
  'Samay ka sahi upyog karne wale log hamesha aage rehte hain.',
  'Kathin shabdon mein jaldbaazi mat karo, lay tumhein paar laga degi.',
  'Mehnat karne wale vidyarthi aksar result mein sabse aage rehte hain.',
  'Tyohaar ke din poore bazaar mein deepak jagmagate hain.',
  'Achhe engineer har chhoti galti ko dhyaan se jaanchte hain.',
  'Sangharsh ke bina koi bhi safalta sthayi nahi hoti.',
  'Dhairya aur anushasan har vijeta ki sabse mazboot taakat hain.',
  'Jigyasu yatri yaadein ikattha karte hain, saamaan nahi.',
  'Bina spasht yojana ke pratibhashali teams bhi samay ganwa deti hain.',
  'Sachcha saahas wahi hai jab haath kaanp rahe hon, tab bhi agla kadam uthana.',
];

export const HINGLISH_EXPERT = [
  'Order 4821 ka price Rs. 1,299 hai; 15% discount ke baad aapko lagbhag Rs. 1,104 dene honge.',
  'Train number 4521 shaam 5:40 baje chalti hai aur agle din subah 6:15 par pahunchti hai.',
  '"Kya meeting 3:30 baje hai ya 4:30?" usne poocha; kisi ko yaad nahi tha, isliye schedule dekha: 4:30.',
  'Class mein 48 students hain; unme se 36 ne pehle round mein 25 WPM se zyada type kiya.',
  'Password jaise Tr0ub4dor&3 mazboot lagte hain, par lambi passphrase (4+ random shabd) zyada surakshit hoti hai.',
  'Is mahine ka budget Rs. 5,40,000 hai: lab ke liye 3,00,000, khel ke liye 1,25,000, baaki events ke liye.',
  'Timer 25 minute ka lagao, bina dhyaan bhatke kaam karo, phir 5 minute aaram karo; yeh 4 baar dohrao.',
  'Room 305 (teesri manzil) mangalvaar ko 10:00-11:30 baje book hai; room 112 poore din khaali hai.',
  'Usne kaha, "Kabhi warm-up mat chhodo;" 15 minute ka abhyas 150 minute ke pachhtave se bachata hai.',
  'Server par ek second mein 1,024 requests aayi, phir bhi latency 120 ms se kam rahi.',
];

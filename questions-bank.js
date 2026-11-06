/**
 * questions-bank.js — the built-in question bank for QuizBattle
 * -----------------------------------------------------------------------------
 * Questions are grouped by CATEGORY. The host picks a category when creating a
 * room ("Mixed" uses all of them).
 *
 * Format of every question:
 *     ['Question text', 'CORRECT answer', 'wrong 1', 'wrong 2', 'wrong 3']
 *
 * The correct answer is always written FIRST here to keep this file easy to
 * edit. database.js shuffles the four answers every time a game starts, so the
 * correct answer lands on a random letter (A–D) each time.
 *
 * To add questions: add a line inside the right category below and restart the
 * server. New questions are inserted automatically; existing ones are never
 * duplicated (the question text must be unique).
 *
 * To add a whole NEW category: add an entry to CATEGORIES (id, label, description)
 * and a list with the same id in QUESTIONS. Use lowercase ids without spaces.
 */
'use strict';

const CATEGORIES = [
  { id: 'technology', label: 'Technology', description: 'Computers, the web, coding and gadgets' },
  { id: 'geography', label: 'Geography', description: 'Countries, capitals, rivers and mountains' },
  { id: 'science', label: 'Science & Nature', description: 'Space, the body, animals, chemistry and maths' },
  { id: 'history', label: 'History', description: 'People and events that shaped the world' },
  { id: 'sports', label: 'Sports', description: 'Football, tennis, the Olympics and more' },
  { id: 'entertainment', label: 'Entertainment', description: 'Movies, music, books and art' },
  { id: 'society', label: 'Society & Culture', description: 'Food, festivals, languages, money and social media' },
];

const QUESTIONS = {
  // ----------------------------------------------------------------------
  // Technology (33 questions)
  // ----------------------------------------------------------------------
  technology: [
    ['Which programming language runs natively inside every web browser?', 'JavaScript', 'Python', 'Java', 'C++'],
    ['What does HTML stand for?', 'HyperText Markup Language', 'High Text Machine Language', 'Hyperlink Text Mark Language', 'Home Tool Markup Language'],
    ['What is CSS used for?', 'Styling web pages', 'Storing data', 'Running servers', 'Compiling code'],
    ['Who co-founded Microsoft with Bill Gates?', 'Paul Allen', 'Steve Wozniak', 'Tim Cook', 'Jeff Bezos'],
    ['Which company created the iPhone?', 'Apple', 'Samsung', 'Nokia', 'Google'],
    ['What does CPU stand for?', 'Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'],
    ['Which language is used to query relational databases?', 'SQL', 'HTML', 'CSS', 'Markdown'],
    ['What is the binary number 1010 in decimal?', '10', '8', '12', '5'],
    ['Which company develops the Android operating system?', 'Google', 'Apple', 'Microsoft', 'Nokia'],
    ['Who invented the World Wide Web?', 'Tim Berners-Lee', 'Vint Cerf', 'Bill Gates', 'Linus Torvalds'],
    ['Who created the Linux kernel?', 'Linus Torvalds', 'Dennis Ritchie', 'Richard Stallman', 'Ken Thompson'],
    ['What does HTTP stand for?', 'HyperText Transfer Protocol', 'High Transfer Text Process', 'HyperText Transmission Program', 'Host Transfer Type Protocol'],
    ['Which of these lets you run JavaScript on a server?', 'Node.js', 'Django', 'Laravel', 'Flask'],
    ['What is Git?', 'A version control system', 'A programming language', 'A web browser', 'An operating system'],
    ['What does RAM stand for?', 'Random Access Memory', 'Read Access Memory', 'Rapid Action Memory', 'Run All Memory'],
    ['How many bits are in a byte?', '8', '4', '16', '10'],
    ['The Python programming language is named after which TV show?', 'Monty Python\'s Flying Circus', 'The Twilight Zone', 'Doctor Who', 'Fawlty Towers'],
    ['Who is often regarded as the first computer programmer?', 'Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Charles Babbage'],
    ['What does URL stand for?', 'Uniform Resource Locator', 'Universal Reference Link', 'Unified Resource Location', 'Uniform Retrieval Label'],
    ['Which company makes the Windows operating system?', 'Microsoft', 'Apple', 'IBM', 'Intel'],
    ['Which keyboard shortcut copies selected text on Windows?', 'Ctrl + C', 'Ctrl + V', 'Ctrl + X', 'Ctrl + Z'],
    ['What does AI stand for in technology?', 'Artificial Intelligence', 'Automated Internet', 'Advanced Input', 'Applied Integration'],
    ['What does USB stand for?', 'Universal Serial Bus', 'United System Board', 'Universal Signal Base', 'Unified Serial Block'],
    ['Which company created the Chrome web browser?', 'Google', 'Microsoft', 'Apple', 'Mozilla'],
    ['What is the main purpose of a firewall?', 'Blocking unauthorised network access', 'Cooling the computer', 'Speeding up downloads', 'Storing backups'],
    ['Which language is officially preferred for building modern Android apps?', 'Kotlin', 'Swift', 'Ruby', 'Perl'],
    ['What does GPS stand for?', 'Global Positioning System', 'General Position Signal', 'Global Path Service', 'Geographic Pointing System'],
    ['What is the name of Apple\'s voice assistant?', 'Siri', 'Alexa', 'Cortana', 'Bixby'],
    ['Which company owns Instagram?', 'Meta', 'Google', 'Microsoft', 'Snap'],
    ['What does "cloud storage" mean?', 'Files stored on remote internet servers', 'Files stored on a cloud-shaped disk', 'Files stored only on a USB stick', 'Files stored in RAM'],
    ['Which data structure works on a "first in, first out" basis?', 'Queue', 'Stack', 'Tree', 'Graph'],
    ['What does HTTPS add compared with plain HTTP?', 'Encryption of the connection', 'Faster downloads', 'Bigger images', 'Free hosting'],
    ['Which company makes the PlayStation console?', 'Sony', 'Microsoft', 'Nintendo', 'Sega'],
  ],

  // ----------------------------------------------------------------------
  // Geography (33 questions)
  // ----------------------------------------------------------------------
  geography: [
    ['What is the capital city of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
    ['What is the capital of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Nagoya'],
    ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
    ['What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador'],
    ['What is the capital of Egypt?', 'Cairo', 'Alexandria', 'Giza', 'Luxor'],
    ['What is the capital of Turkey?', 'Ankara', 'Istanbul', 'Izmir', 'Bursa'],
    ['What is the capital of Thailand?', 'Bangkok', 'Phuket', 'Chiang Mai', 'Pattaya'],
    ['What is the capital of South Korea?', 'Seoul', 'Busan', 'Incheon', 'Daegu'],
    ['What is the capital of Argentina?', 'Buenos Aires', 'Santiago', 'Lima', 'Montevideo'],
    ['What is the capital of Malaysia?', 'Kuala Lumpur', 'Ipoh', 'Kota Kinabalu', 'Malacca City'],
    ['What is the capital of Kenya?', 'Nairobi', 'Mombasa', 'Kampala', 'Dodoma'],
    ['Which is the largest country in the world by area?', 'Russia', 'Canada', 'China', 'United States'],
    ['Which is the largest ocean on Earth?', 'Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'],
    ['Which is the smallest country in the world?', 'Vatican City', 'Monaco', 'San Marino', 'Liechtenstein'],
    ['On which continent is the Sahara Desert?', 'Africa', 'Asia', 'Australia', 'South America'],
    ['Which river flows through Cairo?', 'Nile', 'Tigris', 'Congo', 'Niger'],
    ['Which country is shaped like a boot?', 'Italy', 'Greece', 'Spain', 'Portugal'],
    ['What is the largest island in the world?', 'Greenland', 'Madagascar', 'Borneo', 'New Guinea'],
    ['In which country is most of the Amazon rainforest?', 'Brazil', 'Peru', 'Colombia', 'Venezuela'],
    ['Mount Everest lies on the border of Nepal and which country?', 'China', 'India', 'Bhutan', 'Pakistan'],
    ['Which desert covers parts of Mongolia and northern China?', 'Gobi Desert', 'Kalahari Desert', 'Thar Desert', 'Atacama Desert'],
    ['Which strait separates Spain from Morocco?', 'Strait of Gibraltar', 'Bosphorus', 'Strait of Hormuz', 'Strait of Malacca'],
    ['In which country is the city of Marrakech?', 'Morocco', 'Tunisia', 'Algeria', 'Egypt'],
    ['Which sea lies between Europe and Africa?', 'Mediterranean Sea', 'Baltic Sea', 'Red Sea', 'Black Sea'],
    ['How many continents are there on Earth?', '7', '5', '6', '8'],
    ['What is the capital of Spain?', 'Madrid', 'Barcelona', 'Seville', 'Valencia'],
    ['What is the capital of Germany?', 'Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
    ['What is the capital of Vietnam?', 'Hanoi', 'Ho Chi Minh City', 'Da Nang', 'Hue'],
    ['What is the capital of New Zealand?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown'],
    ['Which mountain range runs along the west coast of South America?', 'The Andes', 'The Alps', 'The Rockies', 'The Himalayas'],
    ['Which is the largest lake in Africa by surface area?', 'Lake Victoria', 'Lake Tanganyika', 'Lake Malawi', 'Lake Chad'],
    ['Which river flows through London?', 'River Thames', 'River Seine', 'River Danube', 'River Rhine'],
    ['Which is the highest mountain in the world above sea level?', 'Mount Everest', 'K2', 'Kangchenjunga', 'Mount Kilimanjaro'],
  ],

  // ----------------------------------------------------------------------
  // Science & Nature (41 questions)
  // ----------------------------------------------------------------------
  science: [
    ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury'],
    ['What is the chemical formula for water?', 'H2O', 'CO2', 'O2', 'NaCl'],
    ['Which gas do plants absorb from the air for photosynthesis?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
    ['What is the hardest natural substance?', 'Diamond', 'Quartz', 'Gold', 'Iron'],
    ['Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Earth', 'Mars'],
    ['Which is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Uranus'],
    ['How many bones does an adult human body have?', '206', '196', '216', '226'],
    ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'],
    ['Which element has the chemical symbol Na?', 'Sodium', 'Nitrogen', 'Neon', 'Nickel'],
    ['What is the chemical symbol for iron?', 'Fe', 'Ir', 'In', 'Fr'],
    ['Approximately how fast does light travel?', '300,000 km per second', '150,000 km per second', '30,000 km per second', '3,000,000 km per second'],
    ['Which gas makes up most of Earth\'s atmosphere?', 'Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon'],
    ['At sea level, at what temperature does water boil in degrees Celsius?', '100', '90', '110', '120'],
    ['Which blood cells carry oxygen around the body?', 'Red blood cells', 'White blood cells', 'Platelets', 'Plasma'],
    ['Which force pulls objects towards the Earth?', 'Gravity', 'Friction', 'Magnetism', 'Inertia'],
    ['Who developed the theory of relativity?', 'Albert Einstein', 'Isaac Newton', 'Galileo Galilei', 'Niels Bohr'],
    ['Which planet is famous for its prominent rings?', 'Saturn', 'Mars', 'Mercury', 'Venus'],
    ['Which part of the cell is known as its powerhouse?', 'Mitochondria', 'Nucleus', 'Ribosome', 'Golgi apparatus'],
    ['What is the closest star to Earth?', 'The Sun', 'Proxima Centauri', 'Sirius', 'Betelgeuse'],
    ['Which vitamin does your skin make when exposed to sunlight?', 'Vitamin D', 'Vitamin C', 'Vitamin A', 'Vitamin B12'],
    ['How many planets are there in our solar system?', '8', '9', '7', '10'],
    ['What does a light-year measure?', 'Distance', 'Time', 'Speed', 'Brightness'],
    ['What is the largest mammal on Earth?', 'Blue whale', 'African elephant', 'Giraffe', 'Hippopotamus'],
    ['At what temperature does water freeze in degrees Fahrenheit?', '32', '0', '12', '100'],
    ['Which layer of the Earth is the thickest?', 'Mantle', 'Crust', 'Outer core', 'Inner core'],
    ['What is the pH of pure water?', '7', '0', '14', '1'],
    ['What is the process by which plants make their own food?', 'Photosynthesis', 'Respiration', 'Fermentation', 'Digestion'],
    ['Which is the hottest planet in our solar system?', 'Venus', 'Mercury', 'Mars', 'Jupiter'],
    ['What is the largest organ of the human body?', 'Skin', 'Liver', 'Brain', 'Lungs'],
    ['What is the unit of electrical resistance?', 'Ohm', 'Volt', 'Watt', 'Ampere'],
    ['How many legs does a spider have?', '8', '6', '10', '12'],
    ['Which animal is the fastest on land?', 'Cheetah', 'Lion', 'Horse', 'Greyhound'],
    ['What is the tallest animal in the world?', 'Giraffe', 'Elephant', 'Ostrich', 'Camel'],
    ['What is a group of lions called?', 'A pride', 'A pack', 'A herd', 'A flock'],
    ['What do you get when you mix blue and yellow paint?', 'Green', 'Purple', 'Orange', 'Brown'],
    ['How many sides does a hexagon have?', '6', '5', '7', '8'],
    ['What is the sum of the angles in a triangle?', '180 degrees', '90 degrees', '270 degrees', '360 degrees'],
    ['What is the square root of 144?', '12', '14', '11', '16'],
    ['Which of these is a prime number?', '17', '15', '21', '27'],
    ['How many colours are traditionally counted in a rainbow?', '7', '6', '8', '5'],
    ['Which animal is known as the "ship of the desert"?', 'Camel', 'Horse', 'Donkey', 'Ostrich'],
  ],

  // ----------------------------------------------------------------------
  // History (32 questions)
  // ----------------------------------------------------------------------
  history: [
    ['Who was the first President of the United States?', 'George Washington', 'Thomas Jefferson', 'Abraham Lincoln', 'John Adams'],
    ['In which year did World War II end?', '1945', '1944', '1946', '1939'],
    ['Which civilization built the pyramids of Giza?', 'Ancient Egyptians', 'Romans', 'Greeks', 'Mayans'],
    ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Botticelli'],
    ['In which year did the Berlin Wall fall?', '1989', '1979', '1991', '1985'],
    ['Who was the first person to walk on the Moon?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'John Glenn'],
    ['In which year did the Titanic sink?', '1912', '1905', '1921', '1898'],
    ['Which explorer reached the Americas in 1492 on a voyage funded by Spain?', 'Christopher Columbus', 'Ferdinand Magellan', 'Vasco da Gama', 'James Cook'],
    ['In which year did the French Revolution begin?', '1789', '1689', '1815', '1848'],
    ['Which scientist won Nobel Prizes in both Physics and Chemistry?', 'Marie Curie', 'Rosalind Franklin', 'Ada Lovelace', 'Florence Nightingale'],
    ['Which empire built the Colosseum in Rome?', 'The Roman Empire', 'The Greek Empire', 'The Ottoman Empire', 'The Byzantine Empire'],
    ['Which civilization built Machu Picchu?', 'The Inca', 'The Aztec', 'The Maya', 'The Olmec'],
    ['Which Egyptian queen allied with Julius Caesar and Mark Antony?', 'Cleopatra', 'Nefertiti', 'Hatshepsut', 'Isis'],
    ['Who was the first human in space?', 'Yuri Gagarin', 'Alan Shepard', 'Neil Armstrong', 'Valentina Tereshkova'],
    ['Which ship carried the Pilgrims to America in 1620?', 'The Mayflower', 'The Santa Maria', 'The Endeavour', 'The Beagle'],
    ['Which country did Mahatma Gandhi lead to independence?', 'India', 'Pakistan', 'Sri Lanka', 'Nepal'],
    ['In which year did Singapore become an independent nation?', '1965', '1963', '1959', '1971'],
    ['Who was the first Prime Minister of Singapore?', 'Lee Kuan Yew', 'Goh Chok Tong', 'Lee Hsien Loong', 'Tony Tan'],
    ['In which year did the Wright brothers make their first powered flight?', '1903', '1895', '1910', '1927'],
    ['Who was the first emperor of Rome?', 'Augustus', 'Julius Caesar', 'Nero', 'Constantine'],
    ['In which year did Nelson Mandela become President of South Africa?', '1994', '1990', '1984', '2000'],
    ['Which country gifted the Statue of Liberty to the United States?', 'France', 'United Kingdom', 'Spain', 'Italy'],
    ['Which ancient wonder stood in the city of Alexandria?', 'The Lighthouse (Pharos)', 'The Hanging Gardens', 'The Colossus', 'The Temple of Artemis'],
    ['Who was the British Prime Minister for most of World War II?', 'Winston Churchill', 'Neville Chamberlain', 'Clement Attlee', 'Margaret Thatcher'],
    ['In which year did World War I begin?', '1914', '1912', '1918', '1939'],
    ['Which wall was built by the Romans to defend northern Britain?', 'Hadrian\'s Wall', 'The Berlin Wall', 'Offa\'s Dyke', 'The Western Wall'],
    ['Who was the first female Prime Minister of the United Kingdom?', 'Margaret Thatcher', 'Theresa May', 'Queen Victoria', 'Indira Gandhi'],
    ['Which ancient civilisation is credited with inventing democracy in Athens?', 'The Ancient Greeks', 'The Romans', 'The Egyptians', 'The Persians'],
    ['Who led the Soviet Union during the Cuban Missile Crisis?', 'Nikita Khrushchev', 'Joseph Stalin', 'Leonid Brezhnev', 'Mikhail Gorbachev'],
    ['In which year did the Soviet Union dissolve?', '1991', '1989', '1985', '1999'],
    ['Which US president issued the Emancipation Proclamation?', 'Abraham Lincoln', 'George Washington', 'Ulysses S. Grant', 'Theodore Roosevelt'],
    ['Which Chinese dynasty built most of the Great Wall that survives today?', 'Ming', 'Qin', 'Tang', 'Han'],
  ],

  // ----------------------------------------------------------------------
  // Sports (26 questions)
  // ----------------------------------------------------------------------
  sports: [
    ['In which sport do you score "love"?', 'Tennis', 'Golf', 'Cricket', 'Rugby'],
    ['How many players from one team are on the pitch in a football (soccer) match?', '11', '9', '10', '12'],
    ['How many rings are there on the Olympic flag?', '5', '4', '6', '7'],
    ['Which country won the FIFA World Cup in 2022?', 'Argentina', 'France', 'Brazil', 'Croatia'],
    ['Which country hosted the 2016 Summer Olympics?', 'Brazil', 'United Kingdom', 'China', 'Japan'],
    ['How high is a standard basketball hoop?', '10 feet (3.05 m)', '8 feet (2.4 m)', '9 feet (2.7 m)', '12 feet (3.7 m)'],
    ['Approximately how long is a marathon?', '42.2 km', '21.1 km', '26.2 km', '50 km'],
    ['How many players from one team are on the court in basketball?', '5', '6', '7', '4'],
    ['In which sport would you perform a slam dunk?', 'Basketball', 'Volleyball', 'Handball', 'Netball'],
    ['Which country did the sport of cricket originate from?', 'England', 'Australia', 'India', 'South Africa'],
    ['How many points is a touchdown worth in American football (before the extra point)?', '6', '7', '3', '5'],
    ['Which country does the sport of sumo wrestling come from?', 'Japan', 'China', 'Korea', 'Mongolia'],
    ['How many Grand Slam tennis tournaments are played each year?', '4', '3', '5', '6'],
    ['Which Grand Slam tennis tournament is played on grass?', 'Wimbledon', 'French Open', 'US Open', 'Australian Open'],
    ['Which country hosted the 2022 FIFA World Cup?', 'Qatar', 'Russia', 'Brazil', 'Japan'],
    ['In golf, what is a score of one stroke under par called?', 'A birdie', 'An eagle', 'A bogey', 'An albatross'],
    ['How many players from one team are on the court in indoor volleyball?', '6', '5', '7', '8'],
    ['In which sport do teams compete for the Stanley Cup?', 'Ice hockey', 'Baseball', 'Basketball', 'American football'],
    ['Which sport uses a shuttlecock?', 'Badminton', 'Tennis', 'Squash', 'Table tennis'],
    ['Where were the first modern Olympic Games held in 1896?', 'Athens', 'Paris', 'London', 'Rome'],
    ['Which sprinter holds the men\'s 100 metres world record of 9.58 seconds?', 'Usain Bolt', 'Carl Lewis', 'Tyson Gay', 'Yohan Blake'],
    ['How long is a standard football (soccer) match, not counting extra time?', '90 minutes', '80 minutes', '100 minutes', '120 minutes'],
    ['The Tour de France is a famous race in which sport?', 'Cycling', 'Running', 'Motor racing', 'Sailing'],
    ['What colour card does a referee show to send a footballer off?', 'Red', 'Yellow', 'Blue', 'Green'],
    ['Which martial art\'s name means "empty hand" in Japanese?', 'Karate', 'Judo', 'Aikido', 'Kendo'],
    ['How many holes are played in a standard round of golf?', '18', '9', '12', '24'],
  ],

  // ----------------------------------------------------------------------
  // Entertainment (25 questions)
  // ----------------------------------------------------------------------
  entertainment: [
    ['Who wrote the play Romeo and Juliet?', 'William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Ernest Hemingway'],
    ['Who wrote the Harry Potter books?', 'J.K. Rowling', 'Suzanne Collins', 'Stephenie Meyer', 'Roald Dahl'],
    ['Who wrote the novel 1984?', 'George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'H.G. Wells'],
    ['Who painted The Starry Night?', 'Vincent van Gogh', 'Claude Monet', 'Pablo Picasso', 'Salvador Dalí'],
    ['How many keys does a standard piano have?', '88', '76', '92', '100'],
    ['How many strings does a standard guitar have?', '6', '4', '5', '7'],
    ['Who directed the 1997 film Titanic?', 'James Cameron', 'Steven Spielberg', 'Ridley Scott', 'Christopher Nolan'],
    ['In which Disney film does the character Simba appear?', 'The Lion King', 'Bambi', 'Aladdin', 'Tarzan'],
    ['Which singer released the album Thriller?', 'Michael Jackson', 'Prince', 'Stevie Wonder', 'Elvis Presley'],
    ['Which band recorded the song "Hey Jude"?', 'The Beatles', 'The Rolling Stones', 'Queen', 'Led Zeppelin'],
    ['Who wrote the novel Pride and Prejudice?', 'Jane Austen', 'Charlotte Brontë', 'George Eliot', 'Mary Shelley'],
    ['Which artist painted the ceiling of the Sistine Chapel?', 'Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'],
    ['Which composer wrote the famous Fifth Symphony that begins "da-da-da-dum"?', 'Beethoven', 'Mozart', 'Bach', 'Haydn'],
    ['What is the name of Harry Potter\'s pet owl?', 'Hedwig', 'Errol', 'Pigwidgeon', 'Scabbers'],
    ['Which 2019 film was the first non-English-language film to win the Oscar for Best Picture?', 'Parasite', 'Roma', 'Amélie', 'Oldboy'],
    ['Who wrote The Lord of the Rings?', 'J.R.R. Tolkien', 'C.S. Lewis', 'George R.R. Martin', 'Terry Pratchett'],
    ['Which animation studio made Toy Story?', 'Pixar', 'DreamWorks', 'Illumination', 'Studio Ghibli'],
    ['Which singer is widely known as the "Queen of Pop"?', 'Madonna', 'Beyoncé', 'Whitney Houston', 'Cher'],
    ['Which band performed "Bohemian Rhapsody"?', 'Queen', 'The Rolling Stones', 'Pink Floyd', 'Abba'],
    ['In which city is the Louvre museum?', 'Paris', 'London', 'Rome', 'Madrid'],
    ['Which actor played Captain Jack Sparrow in Pirates of the Caribbean?', 'Johnny Depp', 'Orlando Bloom', 'Brad Pitt', 'Tom Cruise'],
    ['Which Japanese studio made the film Spirited Away?', 'Studio Ghibli', 'Toei Animation', 'Madhouse', 'Sunrise'],
    ['How many books are in the main Harry Potter series?', '7', '6', '8', '9'],
    ['Which K-pop group released the hit song "Dynamite"?', 'BTS', 'Blackpink', 'EXO', 'Twice'],
    ['Who wrote the book The Little Prince?', 'Antoine de Saint-Exupéry', 'Victor Hugo', 'Jules Verne', 'Albert Camus'],
  ],

  // ----------------------------------------------------------------------
  // Society & Culture (29 questions)
  // ----------------------------------------------------------------------
  society: [
    ['Which nut is the main ingredient of marzipan?', 'Almond', 'Peanut', 'Walnut', 'Cashew'],
    ['What is the main ingredient of guacamole?', 'Avocado', 'Tomato', 'Cucumber', 'Pea'],
    ['Which country is pizza originally from?', 'Italy', 'Greece', 'France', 'United States'],
    ['What is the traditional seaweed wrapping around sushi rolls called?', 'Nori', 'Wakame', 'Kombu', 'Dashi'],
    ['What is the currency of Japan?', 'Yen', 'Won', 'Yuan', 'Ringgit'],
    ['What is the currency of the United Kingdom?', 'Pound sterling', 'Euro', 'Franc', 'Krone'],
    ['What is the currency of India?', 'Rupee', 'Rupiah', 'Taka', 'Dinar'],
    ['Which language has the most native speakers in the world?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi'],
    ['Which fruit is wine traditionally made from?', 'Grapes', 'Apples', 'Plums', 'Oranges'],
    ['Which expensive spice comes from the stigmas of the crocus flower?', 'Saffron', 'Vanilla', 'Cardamom', 'Cinnamon'],
    ['What is the traditional Japanese garment called?', 'Kimono', 'Sari', 'Hanbok', 'Cheongsam'],
    ['Which country is the festival of Diwali most closely associated with?', 'India', 'Thailand', 'Japan', 'Brazil'],
    ['In which country is the Oktoberfest beer festival held?', 'Germany', 'Austria', 'Switzerland', 'Belgium'],
    ['What is the traditional Korean fermented cabbage dish called?', 'Kimchi', 'Sauerkraut', 'Kombucha', 'Natto'],
    ['Which language is spoken in Brazil?', 'Portuguese', 'Spanish', 'English', 'French'],
    ['What is the currency of Singapore?', 'Singapore dollar', 'Malaysian ringgit', 'Thai baht', 'Indonesian rupiah'],
    ['Which currency is used in Germany and France?', 'Euro', 'Pound', 'Franc', 'Krone'],
    ['Which short-video app was created by the company ByteDance?', 'TikTok', 'Snapchat', 'Pinterest', 'Vimeo'],
    ['Which messaging app, owned by Meta, has a green speech-bubble icon?', 'WhatsApp', 'Telegram', 'Signal', 'Line'],
    ['What does "LOL" commonly stand for in online chat?', 'Laughing out loud', 'Lots of love', 'Look out loud', 'Little old lady'],
    ['In which country is the "Running of the Bulls" held in Pamplona?', 'Spain', 'Portugal', 'Mexico', 'Italy'],
    ['Which country is most famous for the tradition of afternoon tea?', 'United Kingdom', 'United States', 'France', 'Netherlands'],
    ['What is the Spanish rice dish often made with saffron, seafood or chicken?', 'Paella', 'Risotto', 'Biryani', 'Jambalaya'],
    ['Which Italian dish is layered pasta with meat sauce and béchamel?', 'Lasagna', 'Ravioli', 'Gnocchi', 'Carbonara'],
    ['Which drink is the most consumed in the world after water?', 'Tea', 'Coffee', 'Milk', 'Orange juice'],
    ['Which dish is a famous Singaporean meal of poached chicken with fragrant rice?', 'Hainanese chicken rice', 'Paella', 'Risotto', 'Biryani'],
    ['Which dish is tossed high for good fortune during Lunar New Year in Singapore?', 'Yusheng', 'Laksa', 'Satay', 'Chilli crab'],
    ['Which festival is celebrated with lanterns and mooncakes?', 'Mid-Autumn Festival', 'Diwali', 'Halloween', 'Thanksgiving'],
    ['In which country did the tradition of Halloween originate?', 'Ireland', 'United States', 'Mexico', 'Germany'],
  ],

};

module.exports = { CATEGORIES, QUESTIONS };

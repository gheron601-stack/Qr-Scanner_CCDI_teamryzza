import AdmZip from 'adm-zip';

/**
 * Extracts slide texts and titles from a .pptx buffer.
 * @param {Buffer} buffer 
 * @returns {Array<{slideNumber: number, title: string, text: string, bullets: string[]}>}
 */
export function parsePptxBuffer(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    // Find all slide XML entries and sort them in natural numerical order
    const slideEntries = zipEntries
      .filter((entry) => entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/i))
      .sort((a, b) => {
        const numA = parseInt(a.entryName.match(/\d+/)[0], 10);
        const numB = parseInt(b.entryName.match(/\d+/)[0], 10);
        return numA - numB;
      });

    const slides = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const entry = slideEntries[i];
      const xmlContent = entry.getData().toString('utf8');

      // Extract all text chunks enclosed in <a:t>...</a:t>
      const textMatches = [];
      const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
      let match;
      while ((match = regex.exec(xmlContent)) !== null) {
        const str = match[1].trim();
        if (str) {
          textMatches.push(str);
        }
      }

      // Group text chunks into coherent paragraphs / bullets
      // In PPTX, runs of text in the same paragraph appear sequentially
      let title = `Slide ${i + 1}`;
      const bullets = [];
      let currentSentence = '';

      for (const chunk of textMatches) {
        // If it looks like a heading/title and we don't have one yet
        if (title === `Slide ${i + 1}` && chunk.length > 2 && chunk.length < 80) {
          title = chunk;
          continue;
        }

        if (chunk.endsWith('.') || chunk.endsWith(':') || chunk.length > 60) {
          currentSentence = currentSentence ? `${currentSentence} ${chunk}` : chunk;
          bullets.push(currentSentence);
          currentSentence = '';
        } else {
          currentSentence = currentSentence ? `${currentSentence} ${chunk}` : chunk;
        }
      }

      if (currentSentence) {
        bullets.push(currentSentence);
      }

      const fullText = [title, ...bullets].join(' ');

      slides.push({
        slideNumber: i + 1,
        title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        bullets: bullets.map(b => b.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')),
        text: fullText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      });
    }

    return slides;
  } catch (error) {
    console.error('Error parsing PPTX buffer:', error);
    throw new Error('Failed to parse presentation. Please ensure it is a valid .pptx file.');
  }
}

/**
 * Automatically creates suggested multiple-choice recap questions from slide contents.
 * @param {Array<{slideNumber: number, title: string, text: string, bullets: string[]}>} slides
 * @returns {Array<{question_text: string, options: Array<{id: string, text: string}>, correct_option: string, time_limit_seconds: number}>}
 */
export function generateSuggestedQuestions(slides) {
  const questions = [];

  if (!slides || slides.length === 0) {
    return [
      {
        question_text: 'What was the primary key takeaway from today’s lecture?',
        options: [
          { id: 'A', text: 'Core theoretical foundation and definitions' },
          { id: 'B', text: 'Implementation architecture and best practices' },
          { id: 'C', text: 'Comparative analysis of alternative approaches' },
          { id: 'D', text: 'All of the above' }
        ],
        correct_option: 'D',
        time_limit_seconds: 25
      }
    ];
  }

  // Pick up to 3-4 slides that have informative titles or bullet points
  const candidateSlides = slides.filter(s => s.title && !s.title.toLowerCase().includes('agenda') && !s.title.toLowerCase().includes('thank you') && !s.title.toLowerCase().includes('q&a') && !s.title.toLowerCase().includes('questions?'));

  const selected = candidateSlides.slice(0, 4);

  selected.forEach((slide, index) => {
    const title = slide.title;
    const bullet = slide.bullets[0] || '';

    if (bullet && bullet.length > 10 && bullet.length < 120) {
      // Create a definition/concept question
      questions.push({
        question_text: `According to the lecture on "${title}", which statement is correct?`,
        options: [
          { id: 'A', text: bullet },
          { id: 'B', text: `It completely replaces traditional approaches without tradeoffs.` },
          { id: 'C', text: `It is deprecated in modern system architectures.` },
          { id: 'D', text: `None of the above.` }
        ],
        correct_option: 'A',
        time_limit_seconds: 25
      });
    } else {
      // Concept recall question
      questions.push({
        question_text: `In today's lesson, what is the main objective of "${title}"?`,
        options: [
          { id: 'A', text: `To optimize overall system performance and workflow.` },
          { id: 'B', text: `To increase operational latency.` },
          { id: 'C', text: `To disable error logging across modules.` },
          { id: 'D', text: `To bypass security access control protocols.` }
        ],
        correct_option: 'A',
        time_limit_seconds: 20
      });
    }
  });

  // Ensure at least 1 question exists
  if (questions.length === 0) {
    questions.push({
      question_text: `What is the central concept discussed in "${slides[0]?.title || 'Today\'s Lesson'}"?`,
      options: [
        { id: 'A', text: 'Practical application and architectural standards' },
        { id: 'B', text: 'Theoretical limitations and deprecated patterns' },
        { id: 'C', text: 'Manual calculation routines' },
        { id: 'D', text: 'Hardware-only requirements' }
      ],
      correct_option: 'A',
      time_limit_seconds: 20
    });
  }

  return questions;
}

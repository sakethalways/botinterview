export const extractTextFromPDF = async (file: File): Promise<string> => {
  // pdfjsLib is loaded globally via script tag in index.html
  const pdfjsLib = (window as any).pdfjsLib;
  
  if (!pdfjsLib) {
    throw new Error("PDF processing library not loaded. Please check internet connection.");
  }

  // Set worker source to the same version as the library
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    // Limit to just the first 2 pages to avoid processing unnecessary data
    const maxPages = Math.min(pdf.numPages, 2); 
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + ' ';
    }
    
    // AGGRESSIVE CLEANING: 
    // 1. Remove anything that isn't a letter, number, space, or basic punctuation.
    //    This strips out hidden control characters, emojis, bullets, and weird PDF encoding.
    // 2. FLATTEN: Replace newlines with spaces to avoid protocol line-break issues
    const cleaned = fullText
        .replace(/[^a-zA-Z0-9\s.,?!@()-]/g, ' ') 
        .replace(/\s+/g, ' ') // Collapse multiple spaces and newlines
        .trim();

    // Limit to 4000 chars for the preview/service layer (constants.ts limits further)
    return cleaned.slice(0, 4000);
  } catch (error) {
    console.error("PDF Extraction Error:", error);
    throw new Error("Failed to extract text from PDF. The file might be corrupted or password protected.");
  }
};
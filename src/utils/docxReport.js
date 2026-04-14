import { strToU8, zipSync } from 'fflate';

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const makeParagraphXml = (text, { bold = false, heading = false } = {}) => {
  const runProps = bold ? '<w:rPr><w:b/></w:rPr>' : '';
  const pStyle = heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : '';
  const safe = escapeXml(text || '');
  return `<w:p>${pStyle}<w:r>${runProps}<w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
};

const makeDocXml = ({ title, scoreRows = [], sections = [] }) => {
  const parts = [];
  parts.push(makeParagraphXml(title || 'IELTS Report', { heading: true }));
  parts.push(makeParagraphXml(`Generated: ${new Date().toLocaleString('vi-VN')}`));
  parts.push(makeParagraphXml(''));
  parts.push(makeParagraphXml('Scores', { bold: true }));
  scoreRows.forEach((row) => {
    parts.push(makeParagraphXml(`- ${row.label}: ${row.value}`));
  });
  parts.push(makeParagraphXml(''));
  parts.push(makeParagraphXml('Feedback', { bold: true }));

  sections.forEach((section) => {
    if (!section) return;
    const heading = section.heading || '';
    if (heading) parts.push(makeParagraphXml(heading, { bold: true }));
    const lines = Array.isArray(section.lines) ? section.lines : [section.text || ''];
    lines.forEach((line) => {
      parts.push(makeParagraphXml(line));
    });
    parts.push(makeParagraphXml(''));
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
<w:body>
${parts.join('\n')}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;
};

export const downloadDocxReport = ({ fileName, title, scoreRows, sections }) => {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
</w:styles>`;

  const files = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    'word/document.xml': strToU8(makeDocXml({ title, scoreRows, sections })),
    'word/styles.xml': strToU8(styles)
  };
  const zip = zipSync(files);
  const blob = new Blob([zip], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName || 'ielts-report.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

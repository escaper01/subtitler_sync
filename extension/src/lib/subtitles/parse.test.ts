import { describe, expect, it } from 'vitest';
import {
  decodeSubtitleBytes,
  parseSRT,
  parseSubtitleText,
  parseTimestamp,
  parseVTT,
  SubtitleParseError,
  sniffFormat,
} from '@/lib/subtitles/parse';

describe('parseTimestamp', () => {
  it('reads SRT comma timestamps', () => {
    expect(parseTimestamp('00:00:01,500')).toBeCloseTo(1.5);
    expect(parseTimestamp('01:02:03,004')).toBeCloseTo(3723.004);
  });

  it('reads VTT dot timestamps, with or without hours', () => {
    expect(parseTimestamp('00:00:01.500')).toBeCloseTo(1.5);
    expect(parseTimestamp('02:03.250')).toBeCloseTo(123.25);
  });

  it('pads short millisecond fields rather than misreading them', () => {
    // "01:00.5" means half a second, not five thousandths.
    expect(parseTimestamp('00:01:00.5')).toBeCloseTo(60.5);
  });

  it('rejects nonsense', () => {
    expect(parseTimestamp('not a time')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('parseSRT', () => {
  it('parses a well-formed file', () => {
    const { cues, warnings } = parseSRT(
      ['1', '00:00:01,000 --> 00:00:03,000', 'First line', 'second row', '', '2', '00:00:04,000 --> 00:00:06,000', 'Next'].join('\n'),
    );

    expect(warnings).toEqual([]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ index: 0, start: 1, end: 3, lines: ['First line', 'second row'] });
    expect(cues[1]?.lines).toEqual(['Next']);
  });

  it('handles CRLF line endings', () => {
    const { cues } = parseSRT('1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n');
    expect(cues[0]?.lines).toEqual(['Hello']);
  });

  it('accepts files with no index lines', () => {
    const { cues } = parseSRT('00:00:01,000 --> 00:00:02,000\nOnly text\n');
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines).toEqual(['Only text']);
  });

  it('recovers when the blank line between cues is missing', () => {
    const { cues } = parseSRT(
      ['1', '00:00:01,000 --> 00:00:02,000', 'One', '2', '00:00:03,000 --> 00:00:04,000', 'Two'].join('\n'),
    );
    expect(cues).toHaveLength(2);
    expect(cues[0]?.lines).toEqual(['One']);
    expect(cues[1]?.lines).toEqual(['Two']);
  });

  it('strips markup and decodes entities', () => {
    const { cues } = parseSRT(
      '1\n00:00:01,000 --> 00:00:02,000\n<i>Bond</i> &amp; <font color="#fff">Moneypenny</font>\n',
    );
    expect(cues[0]?.lines).toEqual(['Bond & Moneypenny']);
  });

  it('strips leftover ASS positioning tags', () => {
    const { cues } = parseSRT('1\n00:00:01,000 --> 00:00:02,000\n{\\an8}Up top\n');
    expect(cues[0]?.lines).toEqual(['Up top']);
  });

  it('keeps text containing bare angle brackets', () => {
    const { cues } = parseSRT('1\n00:00:01,000 --> 00:00:02,000\n5 < 7 and 9 > 3\n');
    expect(cues[0]?.lines).toEqual(['5 < 7 and 9 > 3']);
  });

  it('sorts cues that arrive out of order and says so', () => {
    const { cues, warnings } = parseSRT(
      ['00:00:09,000 --> 00:00:10,000', 'late', '', '00:00:01,000 --> 00:00:02,000', 'early'].join('\n'),
    );
    expect(cues.map((cue) => cue.lines[0])).toEqual(['early', 'late']);
    expect(cues.map((cue) => cue.index)).toEqual([0, 1]);
    expect(warnings.join(' ')).toMatch(/order/);
  });

  it('repairs cues that end before they start', () => {
    const { cues, warnings } = parseSRT('1\n00:00:05,000 --> 00:00:02,000\nBackwards\n');
    expect(cues[0]?.end).toBeGreaterThan(cues[0]!.start);
    expect(warnings.join(' ')).toMatch(/ended before/);
  });

  it('skips unreadable cues but keeps the rest of the file', () => {
    const { cues, warnings } = parseSRT(
      ['1', 'garbage --> also garbage', 'dropped', '', '2', '00:00:04,000 --> 00:00:06,000', 'kept'].join('\n'),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines).toEqual(['kept']);
    expect(warnings).not.toHaveLength(0);
  });
});

describe('parseVTT', () => {
  it('parses a file with a header, identifiers and cue settings', () => {
    const { cues } = parseVTT(
      ['WEBVTT', '', 'intro', '00:00:01.000 --> 00:00:03.000 line:90% align:middle', 'Hello', ''].join('\n'),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ start: 1, end: 3, lines: ['Hello'] });
  });

  it('ignores NOTE, STYLE and REGION blocks', () => {
    const { cues } = parseVTT(
      [
        'WEBVTT',
        '',
        'NOTE this is a comment',
        'spanning two lines',
        '',
        'STYLE',
        '::cue { color: red }',
        '',
        '00:00:01.000 --> 00:00:02.000',
        'Real cue',
      ].join('\n'),
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines).toEqual(['Real cue']);
  });
});

describe('sniffFormat', () => {
  it('recognises VTT by its header regardless of filename', () => {
    expect(sniffFormat('WEBVTT\n\n00:00.000 --> 00:01.000\nx', 'subs.srt')).toBe('vtt');
  });

  it('falls back to the extension, then to SRT', () => {
    expect(sniffFormat('00:00.000 --> 00:01.000\nx', 'subs.vtt')).toBe('vtt');
    expect(sniffFormat('1\n00:00:01,000 --> 00:00:02,000\nx', 'subs.srt')).toBe('srt');
  });
});

describe('decodeSubtitleBytes', () => {
  it('decodes UTF-8', () => {
    const bytes = new TextEncoder().encode('Grüße — café');
    expect(decodeSubtitleBytes(bytes.buffer as ArrayBuffer)).toEqual({
      text: 'Grüße — café',
      encoding: 'utf-8',
    });
  });

  it('strips a UTF-8 BOM', () => {
    const bytes = new TextEncoder().encode('﻿1\n');
    expect(decodeSubtitleBytes(bytes.buffer as ArrayBuffer).text).toBe('1\n');
  });

  it('falls back to windows-1252 for bytes that are not valid UTF-8', () => {
    // 0xFC is "ü" in Windows-1252 and an invalid lone byte in UTF-8.
    const bytes = new Uint8Array([0x47, 0x72, 0xfc, 0xdf, 0x65]);
    const result = decodeSubtitleBytes(bytes.buffer as ArrayBuffer);
    expect(result.encoding).toBe('windows-1252');
    expect(result.text).toBe('Grüße');
  });
});

describe('parseSubtitleText', () => {
  it('throws something actionable when a file has no cues', () => {
    expect(() => parseSubtitleText('just some prose\nno timings here', 'notes.txt')).toThrow(
      SubtitleParseError,
    );
  });
});

import { Pipe, PipeTransform } from '@angular/core';
import { INSTRUMENT_MAPPINGS } from '../constants/instruments.const';

/** Converts a raw contract/symbol ID to a human-readable instrument name. */
@Pipe({ name: 'instrumentName', standalone: true, pure: true })
export class InstrumentNamePipe implements PipeTransform {
  transform(id: string | undefined): string {
    if (!id) return 'N/A';
    return INSTRUMENT_MAPPINGS.find(m => id.includes(m.contains))?.instrument ?? id;
  }
}
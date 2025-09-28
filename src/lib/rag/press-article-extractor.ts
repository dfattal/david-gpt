/**
 * Press Article Content Extractor for Leia Technology
 *
 * Extracts structured metadata from press articles about Leia technology deployments
 * including OEM information, product specs, and Leia-specific features.
 */

import type { PressArticleMetadata } from './types';

export class LeiaArticleExtractor {
  private readonly oemPatterns = [
    // Major OEMs
    /\b(Samsung|LG|Sony|TCL|Hisense|Sharp|Panasonic|Philips|Vizio)\b/gi,
    // Mobile OEMs
    /\b(Apple|Google|OnePlus|Xiaomi|Huawei|OPPO|Vivo|Motorola)\b/gi,
    // Display manufacturers
    /\b(BOE|CSOT|AUO|Innolux|Japan Display|Sharp Display)\b/gi,
    // Gaming companies
    /\b(Nintendo|Microsoft|Sony PlayStation|Steam Deck|ASUS ROG|MSI)\b/gi,
  ];

  private readonly productModelPatterns = [
    // Samsung patterns
    /Samsung\s+(Galaxy\s+(?:Tab\s+)?S\d+(?:\s+Ultra)?|QLED\s+\w+|Neo\s+QLED|The\s+Frame|Odyssey\s+\w+)/gi,
    // LG patterns
    /LG\s+(OLED\s+[A-Z]\d+|UltraFine|UltraWide|C\d+|G\d+|NanoCell)/gi,
    // TCL patterns
    /TCL\s+(\d+\-inch|C\d+|P\d+|R\d+|Mini\s+LED)/gi,
    // Sony patterns
    /Sony\s+(Bravia\s+\w+|PlayStation\s+\d+|Xperia\s+\w+)/gi,
    // Apple patterns
    /Apple\s+(iPhone\s+\d+(?:\s+Pro)?|iPad(?:\s+Pro)?|MacBook(?:\s+Pro)?|iMac|Pro\s+Display)/gi,
  ];

  private readonly displaySpecPatterns = {
    size: /(\d+(?:\.\d+)?)\s*[-"″]\s*inch(?:es)?|(\d+(?:\.\d+)?)"|\b(\d+)\s*inches?\b/gi,
    type: /\b(OLED|QLED|Mini\s*LED|Micro\s*LED|LCD|E\s*Ink|AMOLED|Super\s*AMOLED)\b/gi,
    refreshRate: /(\d+)\s*Hz|(\d+)\s*frames?\s*per\s*second|(\d+)\s*fps/gi,
    resolution:
      /\b(4K|8K|1080p|1440p|2160p|3840\s*[x×]\s*2160|1920\s*[x×]\s*1080)\b/gi,
  };

  private readonly leiaFeaturePatterns = [
    /\b3D\s+display(?:s)?/gi,
    /\blightfield\s+display(?:s)?/gi,
    /\bimmersive\s+(?:gaming|experience|viewing)/gi,
    /\bAR\s+interface/gi,
    /\baugmented\s+reality/gi,
    /\bholographic\s+display(?:s)?/gi,
    /\bdepth\s+sensing/gi,
    /\beye\s+tracking/gi,
    /\bglasses[\-\s]*free\s+3D/gi,
    /\bautostereoscopic/gi,
    /\bmulti[\-\s]?view\s+display/gi,
    /\bparallax\s+barrier/gi,
    /\blenticular\s+display/gi,
    /\bLeia\s+(?:3D|technology|display|screen)/gi,
  ];

  private readonly productCategoryPatterns = [
    {
      pattern: /\b(?:smart\s*)?TV(?:s)?|\btelevision(?:s)?\b/gi,
      category: 'TV',
    },
    {
      pattern: /\b(?:smart)?phone(?:s)?\b|\bmobile\s+device(?:s)?\b/gi,
      category: 'Smartphone',
    },
    { pattern: /\btablet(?:s)?\b|\biPad(?:s)?\b/gi, category: 'Tablet' },
    { pattern: /\bmonitor(?:s)?\b|\bdisplay(?:s)?\b/gi, category: 'Monitor' },
    { pattern: /\blaptop(?:s)?\b|\bnotebook(?:s)?\b/gi, category: 'Laptop' },
    {
      pattern: /\bgaming\s+(?:console|device|handheld)/gi,
      category: 'Gaming Console',
    },
    { pattern: /\bsmart\s+glass(?:es)?\b/gi, category: 'Smart Glasses' },
    {
      pattern: /\bheadset(?:s)?\b|\bVR\s+headset/gi,
      category: 'VR/AR Headset',
    },
    { pattern: /\bprojector(?:s)?\b/gi, category: 'Projector' },
  ];

  private readonly pricePatterns = [
    /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|USD)/gi,
    /priced?\s+(?:at|from)\s*\$?(\d{1,3}(?:,\d{3})*)/gi,
    /\b(under|over|around|about)\s*\$(\d{1,3}(?:,\d{3})*)/gi,
    /\b(premium|budget|mid[\-\s]?range|high[\-\s]?end|entry[\-\s]?level)\b/gi,
  ];

  private readonly journalistPatterns = [
    /by\s+([\w\s]+?)(?:\s*\||$|\n)/gi,
    /(?:written|authored)\s+by\s+([\w\s]+)/gi,
    /author:\s*([\w\s]+)/gi,
    /reporter:\s*([\w\s]+)/gi,
  ];

  private readonly marketRegionPatterns = [
    /\b(North\s+America|United\s+States|USA?|Canada)\b/gi,
    /\b(Europe|EU|UK|United\s+Kingdom|Germany|France|Italy|Spain)\b/gi,
    /\b(Asia|China|Japan|South\s+Korea|India|Southeast\s+Asia)\b/gi,
    /\b(global(?:ly)?|worldwide|international)\b/gi,
  ];

  /**
   * Extract Leia technology metadata from article content
   */
  public extractMetadata(
    title: string,
    content: string,
    url: string
  ): Partial<PressArticleMetadata> {
    const fullText = `${title} ${content}`;

    return {
      title,
      oem: this.extractOEM(fullText),
      model: this.extractProductModel(fullText),
      displaySize: this.extractDisplaySize(fullText),
      displayType: this.extractDisplayType(fullText),
      refreshRate: this.extractRefreshRate(fullText),
      leiaFeature: this.extractLeiaFeatures(fullText),
      productCategory: this.extractProductCategory(fullText),
      journalist: this.extractJournalists(fullText),
      outlet: this.extractOutlet(url),
      priceRange: this.extractPriceRange(fullText),
      marketRegion: this.extractMarketRegions(fullText),
      sourceUrl: url,
      authority: 'EXA', // Assuming EXA is used for content extraction
    };
  }

  private extractOEM(content: string): string {
    for (const pattern of this.oemPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Return the most frequently mentioned OEM
        const oemCounts = matches.reduce(
          (acc: Record<string, number>, match) => {
            const oem = match.trim();
            acc[oem] = (acc[oem] || 0) + 1;
            return acc;
          },
          {}
        );

        return Object.keys(oemCounts).reduce((a, b) =>
          oemCounts[a] > oemCounts[b] ? a : b
        );
      }
    }
    return '';
  }

  private extractProductModel(content: string): string | undefined {
    for (const pattern of this.productModelPatterns) {
      const match = content.match(pattern);
      if (match && match[0]) {
        return match[0].trim();
      }
    }
    return undefined;
  }

  private extractDisplaySize(content: string): string | undefined {
    const matches = content.match(this.displaySpecPatterns.size);
    if (matches && matches[0]) {
      const sizeMatch = matches[0].match(/(\d+(?:\.\d+)?)/);
      if (sizeMatch) {
        return `${sizeMatch[1]}-inch`;
      }
    }
    return undefined;
  }

  private extractDisplayType(
    content: string
  ): 'OLED' | 'LCD' | 'MicroLED' | 'Other' | undefined {
    const matches = content.match(this.displaySpecPatterns.type);
    if (matches && matches[0]) {
      const type = matches[0].toUpperCase().replace(/\s+/g, '');
      switch (type) {
        case 'OLED':
        case 'AMOLED':
        case 'SUPERAMOLED':
          return 'OLED';
        case 'LCD':
          return 'LCD';
        case 'MICROLED':
        case 'MINILED':
          return 'MicroLED';
        default:
          return 'Other';
      }
    }
    return undefined;
  }

  private extractRefreshRate(content: string): string | undefined {
    const matches = content.match(this.displaySpecPatterns.refreshRate);
    if (matches && matches[0]) {
      const rateMatch = matches[0].match(/(\d+)/);
      if (rateMatch) {
        return `${rateMatch[1]}Hz`;
      }
    }
    return undefined;
  }

  private extractLeiaFeatures(content: string): string[] {
    const features: string[] = [];

    for (const pattern of this.leiaFeaturePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanFeature = match
            .trim()
            .replace(/\b3D\s+display(?:s)?\b/gi, '3D Display')
            .replace(/\blightfield\s+display(?:s)?\b/gi, 'Lightfield Display')
            .replace(
              /\bimmersive\s+(?:gaming|experience|viewing)\b/gi,
              'Immersive Experience'
            )
            .replace(/\bAR\s+interface\b/gi, 'AR Interface')
            .replace(/\baugmented\s+reality\b/gi, 'Augmented Reality')
            .replace(/\bholographic\s+display(?:s)?\b/gi, 'Holographic Display')
            .replace(/\beye\s+tracking\b/gi, 'Eye Tracking')
            .replace(/\bglasses[\-\s]*free\s+3D\b/gi, 'Glasses-Free 3D')
            .replace(
              /\bLeia\s+(?:3D|technology|display|screen)\b/gi,
              'Leia Technology'
            );

          if (cleanFeature && !features.includes(cleanFeature)) {
            features.push(cleanFeature);
          }
        });
      }
    }

    return features;
  }

  private extractProductCategory(content: string): string {
    for (const { pattern, category } of this.productCategoryPatterns) {
      if (pattern.test(content)) {
        return category;
      }
    }
    return 'Other';
  }

  private extractJournalists(content: string): string[] | undefined {
    const journalists: string[] = [];

    for (const pattern of this.journalistPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const nameMatch = match.match(
            /by\s+([\w\s]+?)(?:\s*\||$|\n)|(?:written|authored)\s+by\s+([\w\s]+)|author:\s*([\w\s]+)|reporter:\s*([\w\s]+)/i
          );
          if (nameMatch) {
            const name = (
              nameMatch[1] ||
              nameMatch[2] ||
              nameMatch[3] ||
              nameMatch[4]
            )?.trim();
            if (name && name.length < 50 && !journalists.includes(name)) {
              journalists.push(name);
            }
          }
        });
      }
    }

    return journalists.length > 0 ? journalists : undefined;
  }

  private extractOutlet(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Map hostnames to outlet names
      const outletMap: Record<string, string> = {
        'techcrunch.com': 'TechCrunch',
        'theverge.com': 'The Verge',
        'cnet.com': 'CNET',
        'engadget.com': 'Engadget',
        'arstechnica.com': 'Ars Technica',
        'wired.com': 'Wired',
        'gizmodo.com': 'Gizmodo',
        'androidcentral.com': 'Android Central',
        'androidpolice.com': 'Android Police',
        '9to5google.com': '9to5Google',
        '9to5mac.com': '9to5Mac',
        'macrumors.com': 'MacRumors',
        'tomshardware.com': "Tom's Hardware",
        'anandtech.com': 'AnandTech',
        'pcmag.com': 'PC Magazine',
        'digitaltrends.com': 'Digital Trends',
        'gsmarena.com': 'GSMArena',
        'phonearena.com': 'PhoneArena',
        'androidauthority.com': 'Android Authority',
        'sammobile.com': 'SamMobile',
        'displaydaily.com': 'Display Daily',
        'flatpanelshd.com': 'FlatpanelsHD',
        'rtings.com': 'RTINGS',
        'techradar.com': 'TechRadar',
        'zdnet.com': 'ZDNet',
        'venturebeat.com': 'VentureBeat',
        'forbes.com': 'Forbes',
        'reuters.com': 'Reuters',
        'bloomberg.com': 'Bloomberg',
        'wsj.com': 'Wall Street Journal',
        'nytimes.com': 'New York Times',
      };

      // Find matching outlet
      for (const [domain, outlet] of Object.entries(outletMap)) {
        if (hostname.includes(domain)) {
          return outlet;
        }
      }

      // Fallback: capitalize hostname
      return hostname
        .replace('www.', '')
        .replace('.com', '')
        .replace('.org', '')
        .replace('.net', '')
        .split('.')[0]
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch (error) {
      return 'Unknown';
    }
  }

  private extractPriceRange(content: string): string | undefined {
    const priceMatches = content.match(this.pricePatterns[0]);
    const priceDescMatches = content.match(this.pricePatterns[3]);

    if (priceMatches && priceMatches.length > 0) {
      const prices = priceMatches
        .map(match => {
          const num = match.replace(/[$,]/g, '');
          return parseInt(num);
        })
        .filter(price => price > 50 && price < 50000); // Filter reasonable prices

      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        if (minPrice === maxPrice) {
          return `$${minPrice.toLocaleString()}`;
        } else {
          return `$${minPrice.toLocaleString()}-$${maxPrice.toLocaleString()}`;
        }
      }
    }

    if (priceDescMatches && priceDescMatches.length > 0) {
      return priceDescMatches[0]
        .toLowerCase()
        .replace(/\b(premium)\b/g, 'Premium')
        .replace(/\b(budget)\b/g, 'Budget')
        .replace(/\b(mid[\-\s]?range)\b/g, 'Mid-Range')
        .replace(/\b(high[\-\s]?end)\b/g, 'High-End')
        .replace(/\b(entry[\-\s]?level)\b/g, 'Entry-Level');
    }

    return undefined;
  }

  private extractMarketRegions(content: string): string[] | undefined {
    const regions: string[] = [];

    for (const pattern of this.marketRegionPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          let region = match.trim();

          // Normalize region names
          if (/north\s+america|usa?|united\s+states|canada/i.test(region)) {
            region = 'North America';
          } else if (
            /europe|eu|uk|united\s+kingdom|germany|france|italy|spain/i.test(
              region
            )
          ) {
            region = 'Europe';
          } else if (
            /asia|china|japan|south\s+korea|india|southeast\s+asia/i.test(
              region
            )
          ) {
            region = 'Asia';
          } else if (/global|worldwide|international/i.test(region)) {
            region = 'Global';
          }

          if (!regions.includes(region)) {
            regions.push(region);
          }
        });
      }
    }

    return regions.length > 0 ? regions : undefined;
  }
}

export const leiaArticleExtractor = new LeiaArticleExtractor();

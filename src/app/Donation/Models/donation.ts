// GlobalGiving API 응답 타입 정의
export interface GlobalGivingProject {
  id: number;
  title: string;
  summary: string;
  description?: string;
  imageLink?: string;
  goal?: number;
  funding?: number;
  numberOfDonations?: number;
  themes?: {
    theme: Array<{
      id: string;
      name: string;
    }>;
  };
  organization?: {
    id: number;
    name: string;
    url?: string;
  };
  active?: boolean;
  remaining?: number;
  iso3166CountryCode?: string;
  longTermImpact?: string;
  projectLink?: string;
  endorsements?: number;
  status?: string;
  need?: string;
  fullDescription?: string;
  contactAddress?: string;
  contactCity?: string;
  contactState?: string;
  contactCountry?: string;
  contactZip?: string;
  contactUrl?: string;
  progressReportLink?: string;
  type?: string;
  modifiedDate?: string;
  image?: {
    title?: string;
    url?: string;
    imagelink?: Array<{
      url: string;
      size: string;
    }>;
  };
}

export interface GlobalGivingResponse {
  projects: {
    numberFound: number;
    project: GlobalGivingProject[];
  };
}

import { Injectable } from '@angular/core';

// GlobalGiving API 응답 타입 정의 (기존과 동일)
export interface GlobalGivingProject {
  id: number;
  title: string;
  summary: string;
  description?: string;
  imageLink?: string;
  goal?: number;
  funding?: number;
  numberOfDonations?: number;
  themes?: {
    theme: Array<{
      id: string;
      name: string;
    }>;
  };
  organization?: {
    id: number;
    name: string;
    url?: string;
  };
  active?: boolean;
  remaining?: number;
  iso3166CountryCode?: string;
  longTermImpact?: string;
  projectLink?: string;
  endorsements?: number;
  status?: string;
  need?: string;
  fullDescription?: string;
  contactAddress?: string;
  contactCity?: string;
  contactState?: string;
  contactCountry?: string;
  contactZip?: string;
  contactUrl?: string;
  progressReportLink?: string;
  type?: string;
  modifiedDate?: string;
  image?: {
    title?: string;
    url?: string;
    imagelink?: Array<{
      url: string;
      size: string;
    }>;
  };
}

export interface GlobalGivingResponse {
  projects: {
    numberFound: number;
    project: GlobalGivingProject[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class GlobalGivingFactory {

  /**
   * 빈 GlobalGivingProject 객체를 생성합니다.
   * @param id 프로젝트 ID (기본값: 0)
   * @param title 프로젝트 제목 (기본값: '')
   * @param summary 프로젝트 요약 (기본값: '')
   * @returns 빈 GlobalGivingProject 객체
   */
  createEmptyProject(id: number = 0, title: string = '', summary: string = ''): GlobalGivingProject {
    return {
      id,
      title,
      summary,
      description: undefined,
      imageLink: undefined,
      goal: undefined,
      funding: undefined,
      numberOfDonations: undefined,
      themes: undefined,
      organization: undefined,
      active: undefined,
      remaining: undefined,
      iso3166CountryCode: undefined,
      longTermImpact: undefined,
      projectLink: undefined,
      endorsements: undefined,
      status: undefined,
      need: undefined,
      fullDescription: undefined,
      contactAddress: undefined,
      contactCity: undefined,
      contactState: undefined,
      contactCountry: undefined,
      contactZip: undefined,
      contactUrl: undefined,
      progressReportLink: undefined,
      type: undefined,
      modifiedDate: undefined,
      image: undefined
    };
  }

  /**
   * 기본값이 설정된 GlobalGivingProject 객체를 생성합니다.
   * @param id 프로젝트 ID
   * @param title 프로젝트 제목
   * @param summary 프로젝트 요약
   * @returns 기본값이 설정된 GlobalGivingProject 객체
   */
  createDefaultProject(id: number = 0, title: string = '', summary: string = ''): GlobalGivingProject {
    return {
      id,
      title,
      summary,
      description: '',
      imageLink: '',
      goal: 0,
      funding: 0,
      numberOfDonations: 0,
      themes: {
        theme: []
      },
      organization: {
        id: 0,
        name: '',
        url: ''
      },
      active: true,
      remaining: 0,
      iso3166CountryCode: '',
      longTermImpact: '',
      projectLink: '',
      endorsements: 0,
      status: 'active',
      need: '',
      fullDescription: '',
      contactAddress: '',
      contactCity: '',
      contactState: '',
      contactCountry: '',
      contactZip: '',
      contactUrl: '',
      progressReportLink: '',
      type: '',
      modifiedDate: new Date().toISOString(),
      image: {
        title: '',
        url: '',
        imagelink: []
      }
    };
  }

  /**
   * 빈 GlobalGivingResponse 객체를 생성합니다.
   * @returns 빈 GlobalGivingResponse 객체
   */
  createEmptyResponse(): GlobalGivingResponse {
    return {
      projects: {
        numberFound: 0,
        project: []
      }
    };
  }

  /**
   * 테스트용 샘플 GlobalGivingProject 객체를 생성합니다.
   * @param index 인덱스 (여러 개 생성 시 구분용)
   * @returns 샘플 데이터가 채워진 GlobalGivingProject 객체
   */
  createSampleProject(index: number = 1): GlobalGivingProject {
    const sampleThemes = [
      { id: 'education', name: 'Education' },
      { id: 'health', name: 'Health' },
      { id: 'environment', name: 'Environment' },
      { id: 'animals', name: 'Animals' },
      { id: 'disaster', name: 'Disaster Recovery' }
    ];

    const sampleCountries = ['US', 'IN', 'KE', 'GT', 'BD', 'NP', 'PH', 'UG'];
    const sampleOrganizations = [
      'Save the Children',
      'World Vision',
      'Oxfam',
      'Red Cross',
      'UNICEF',
      'Doctors Without Borders'
    ];

    return {
      id: 1000 + index,
      title: `Sample Project ${index}`,
      summary: `This is a sample project ${index} for testing purposes.`,
      description: `Detailed description for sample project ${index}. This project aims to make a positive impact in the community.`,
      imageLink: `https://via.placeholder.com/400x300/4CAF50/FFFFFF?text=Project+${index}`,
      goal: Math.floor(Math.random() * 50000) + 10000,
      funding: Math.floor(Math.random() * 30000) + 5000,
      numberOfDonations: Math.floor(Math.random() * 100) + 10,
      themes: {
        theme: [sampleThemes[index % sampleThemes.length]]
      },
      organization: {
        id: 100 + index,
        name: sampleOrganizations[index % sampleOrganizations.length],
        url: `https://www.sample-org-${index}.org`
      },
      active: true,
      remaining: Math.floor(Math.random() * 20000) + 5000,
      iso3166CountryCode: sampleCountries[index % sampleCountries.length],
      longTermImpact: `Long-term impact description for project ${index}`,
      projectLink: `https://www.globalgiving.org/projects/${1000 + index}/`,
      endorsements: Math.floor(Math.random() * 10),
      status: 'active',
      need: `Urgent need description for project ${index}`,
      fullDescription: `Full detailed description for sample project ${index}. This includes comprehensive information about the project goals, methodology, and expected outcomes.`,
      contactAddress: `${100 + index} Sample Street`,
      contactCity: 'Sample City',
      contactState: 'Sample State',
      contactCountry: 'Sample Country',
      contactZip: `${10000 + index}`,
      contactUrl: `https://contact.sample-org-${index}.org`,
      progressReportLink: `https://www.globalgiving.org/projects/${1000 + index}/reports/`,
      type: 'project',
      modifiedDate: new Date().toISOString(),
      image: {
        title: `Project ${index} Image`,
        url: `https://via.placeholder.com/400x300/4CAF50/FFFFFF?text=Project+${index}`,
        imagelink: [
          {
            url: `https://via.placeholder.com/150x150/4CAF50/FFFFFF?text=Small+${index}`,
            size: 'small'
          },
          {
            url: `https://via.placeholder.com/300x200/4CAF50/FFFFFF?text=Medium+${index}`,
            size: 'medium'
          },
          {
            url: `https://via.placeholder.com/600x400/4CAF50/FFFFFF?text=Large+${index}`,
            size: 'large'
          }
        ]
      }
    };
  }

  /**
   * 테스트용 샘플 GlobalGivingResponse 객체를 생성합니다.
   * @param projectCount 생성할 프로젝트 개수 (기본값: 5)
   * @returns 샘플 데이터가 채워진 GlobalGivingResponse 객체
   */
  createSampleResponse(projectCount: number = 5): GlobalGivingResponse {
    const projects: GlobalGivingProject[] = [];
    
    for (let i = 1; i <= projectCount; i++) {
      projects.push(this.createSampleProject(i));
    }

    return {
      projects: {
        numberFound: projectCount,
        project: projects
      }
    };
  }

  /**
   * 특정 테마의 샘플 프로젝트를 생성합니다.
   * @param theme 테마 ID
   * @param themeName 테마 이름
   * @param index 인덱스
   * @returns 특정 테마의 샘플 프로젝트
   */
  createProjectByTheme(theme: string, themeName: string, index: number = 1): GlobalGivingProject {
    const project = this.createSampleProject(index);
    
    project.themes = {
      theme: [{ id: theme, name: themeName }]
    };
    
    // 테마에 따른 제목과 설명 조정
    switch (theme) {
      case 'education':
        project.title = `Education Initiative ${index}`;
        project.summary = `Providing quality education to underserved communities.`;
        break;
      case 'health':
        project.title = `Healthcare Project ${index}`;
        project.summary = `Improving healthcare access in rural areas.`;
        break;
      case 'environment':
        project.title = `Environmental Conservation ${index}`;
        project.summary = `Protecting natural resources and biodiversity.`;
        break;
      case 'animals':
        project.title = `Animal Welfare Program ${index}`;
        project.summary = `Rescuing and caring for endangered animals.`;
        break;
      case 'disaster':
        project.title = `Disaster Relief Effort ${index}`;
        project.summary = `Emergency response and recovery assistance.`;
        break;
      default:
        project.title = `Community Development ${index}`;
        project.summary = `Supporting community-led development initiatives.`;
    }
    
    return project;
  }

  /**
   * 특정 국가의 샘플 프로젝트를 생성합니다.
   * @param countryCode ISO 국가 코드
   * @param index 인덱스
   * @returns 특정 국가의 샘플 프로젝트
   */
  createProjectByCountry(countryCode: string, index: number = 1): GlobalGivingProject {
    const project = this.createSampleProject(index);
    project.iso3166CountryCode = countryCode;
    
    // 국가별 조정
    const countryInfo = this.getCountryInfo(countryCode);
    project.title = `${countryInfo.name} Development Project ${index}`;
    project.summary = `Supporting communities in ${countryInfo.name}.`;
    project.contactCountry = countryInfo.name;
    
    return project;
  }

  /**
   * 국가 코드에 따른 국가 정보를 반환합니다.
   * @param countryCode ISO 국가 코드
   * @returns 국가 정보
   */
  private getCountryInfo(countryCode: string): { name: string; region: string } {
    const countries: { [key: string]: { name: string; region: string } } = {
      'US': { name: 'United States', region: 'North America' },
      'IN': { name: 'India', region: 'Asia' },
      'KE': { name: 'Kenya', region: 'Africa' },
      'GT': { name: 'Guatemala', region: 'Central America' },
      'BD': { name: 'Bangladesh', region: 'Asia' },
      'NP': { name: 'Nepal', region: 'Asia' },
      'PH': { name: 'Philippines', region: 'Asia' },
      'UG': { name: 'Uganda', region: 'Africa' },
      'KR': { name: 'South Korea', region: 'Asia' },
      'VN': { name: 'Vietnam', region: 'Asia' },
      'TH': { name: 'Thailand', region: 'Asia' },
      'MM': { name: 'Myanmar', region: 'Asia' },
      'KH': { name: 'Cambodia', region: 'Asia' }
    };
    
    return countries[countryCode] || { name: 'Unknown Country', region: 'Unknown' };
  }

  /**
   * 프로젝트 필드가 null/undefined인지 확인합니다.
   * @param project 확인할 프로젝트
   * @returns 빈 필드들의 배열
   */
  validateProject(project: GlobalGivingProject): string[] {
    const emptyFields: string[] = [];
    
    if (!project.id) emptyFields.push('id');
    if (!project.title) emptyFields.push('title');
    if (!project.summary) emptyFields.push('summary');
    if (!project.organization?.name) emptyFields.push('organization.name');
    
    return emptyFields;
  }

  /**
   * 프로젝트를 안전하게 복사합니다.
   * @param project 복사할 프로젝트
   * @returns 깊은 복사된 프로젝트
   */
  cloneProject(project: GlobalGivingProject): GlobalGivingProject {
    return JSON.parse(JSON.stringify(project));
  }

  /**
   * 프로젝트 배열을 ID로 정렬합니다.
   * @param projects 정렬할 프로젝트 배열
   * @param ascending 오름차순 여부 (기본값: true)
   * @returns 정렬된 프로젝트 배열
   */
  sortProjectsById(projects: GlobalGivingProject[], ascending: boolean = true): GlobalGivingProject[] {
    return [...projects].sort((a, b) => 
      ascending ? a.id - b.id : b.id - a.id
    );
  }

  /**
   * 빈 이미지 객체를 생성합니다.
   */
  createEmptyImage() {
    return {
      title: undefined,
      url: undefined,
      imagelink: undefined
    };
  }

  /**
   * 빈 테마 객체를 생성합니다.
   */
  createEmptyThemes() {
    return {
      theme: []
    };
  }

  /**
   * 빈 조직 객체를 생성합니다.
   */
  createEmptyOrganization() {
    return {
      id: 0,
      name: '',
      url: undefined
    };
  }
}
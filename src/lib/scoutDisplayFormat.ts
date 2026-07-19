export function isElementarySchoolGrade(value: string | null | undefined) {
  return Boolean(value?.replace(/\s/g, "").includes("초등학교"));
}

export function isMiddleSchoolGrade(value: string | null | undefined) {
  return Boolean(value?.replace(/\s/g, "").includes("중학교"));
}

export function isHighSchoolGrade(value: string | null | undefined) {
  return Boolean(value?.replace(/\s/g, "").includes("고등학교"));
}

/** 공백 제거 후 `초등학교|중학교|고등학교` + 숫자 + `학년` 형식 여부 */
function matchSchoolGradeFormat(grade: string | null | undefined) {
  if (!grade?.trim()) return null;

  const normalized = grade.replace(/\s/g, "");
  const match = normalized.match(/^(초등학교|중학교|고등학교)(\d+)학년$/);
  if (!match) return null;

  return {
    school: match[1] as "초등학교" | "중학교" | "고등학교",
    gradeNumber: match[2],
  };
}

/** 목록 표시 전용. DB/폼 값은 변경하지 않는다. */
export function formatGradeShort(grade: string | null | undefined) {
  const matched = matchSchoolGradeFormat(grade);
  if (!matched) return grade ?? "";

  const prefix =
    matched.school === "초등학교"
      ? "초"
      : matched.school === "중학교"
        ? "중"
        : "고";
  return `${prefix}${matched.gradeNumber}`;
}

/**
 * 기능장 취득현황 대상 학년.
 * 프로젝트 표준 형식(중학교/고등학교 N학년)만 포함. null·빈값·초등학교·기타 문자열 제외.
 */
export function isMeritBadgeTargetGrade(grade: string | null | undefined) {
  const matched = matchSchoolGradeFormat(grade);
  return matched?.school === "중학교" || matched?.school === "고등학교";
}

/** 학년 기준 구분 원본 라벨. ScoutsPage와 동일 원칙. */
export function getScoutSectionLabelByGrade(grade: string | null | undefined) {
  if (!grade) return "구분 미지정";
  if (isElementarySchoolGrade(grade)) return "컵스카우트";
  if (isMiddleSchoolGrade(grade)) return "스카우트";
  if (isHighSchoolGrade(grade)) return "벤처스카우트";
  return grade;
}

/** 목록 표시 전용 구분 축약. 알 수 없는 값은 원본 유지. */
export function formatScoutTypeShort(type: string) {
  const exactMap: Record<string, string> = {
    컵스카우트: "컵",
    "컵스카우트(초등학생)": "컵",
    스카우트: "스카우트",
    "스카우트(중학생)": "스카우트",
    벤처스카우트: "벤처",
    "벤처스카우트(고등학생)": "벤처",
    로버스카우트: "로버",
  };

  return exactMap[type] ?? type;
}

/**
 * 구분 정렬용 순서. 축약 표시값이 아닌 학년→원본 구분 체계 기준.
 * 초등(컵) → 중등(스카우트) → 고등(벤처) → 기타
 */
export function getScoutSectionSortOrder(grade: string | null | undefined) {
  if (isElementarySchoolGrade(grade)) return 1;
  if (isMiddleSchoolGrade(grade)) return 2;
  if (isHighSchoolGrade(grade)) return 3;
  return 9;
}
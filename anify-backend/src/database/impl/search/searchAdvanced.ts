import { sqlite, dbType, postgres } from "../..";
import { Format, Genres, Season, Sort, SortDirection, Type } from "../../../types/enums";
import { Anime, Db, Manga } from "../../../types/types";

type ReturnType<T> = T extends Type.ANIME ? Anime[] : Manga[];

export const searchAdvanced = async <T extends Type.ANIME | Type.MANGA>(
    query: string,
    type: T,
    formats: Format[],
    page: number,
    perPage: number,
    genres: Genres[] = [],
    genresExcluded: Genres[] = [],
    season: Season = Season.UNKNOWN,
    year = 0,
    tags: string[] = [],
    tagsExcluded: string[] = [],
    sort: Sort = Sort.TITLE,
    sortDirection: SortDirection = SortDirection.DESC,
) => {
    if (dbType === "postgresql") {
        const skip = page > 0 ? perPage * (page - 1) : 0;
        let where;

        if (type === Type.ANIME) {
            where = `
                WHERE
                (
                    ${query.length > 0 ? `$1` : `'%'`} ILIKE ANY("anime".synonyms)
                    OR  ${query.length > 0 ? `$1` : `'%'`}    % ANY("anime".synonyms)
                    OR "anime".title->>'english' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                    OR "anime".title->>'romaji' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                    OR "anime".title->>'native' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                )
                ${formats.length > 0 ? `AND "anime"."format" IN (${formats.map((f) => `'${f}'`)})` : ""}
                ${genres && genres.length > 0 ? `AND ARRAY[${genres.map((g) => `'${g}'`)}] <@ "anime"."genres"` : ""}
                ${genresExcluded.length > 0 ? `AND NOT ARRAY[${genresExcluded.map((g) => `'${g}'`)}] <@ "anime"."genres"` : ""}
                ${tags && tags.length > 0 ? `AND ARRAY[${tags.map((g) => `'${g}'`)}] <@ "anime"."tags"` : ""}
                ${tagsExcluded.length > 0 ? `AND NOT ARRAY[${tagsExcluded.map((g) => `'${g}'`)}] <@ "anime"."tags"` : ""}
                ${season && season !== Season.UNKNOWN ? `AND "anime"."season" = '${season}'` : ""}
                ${year > 0 ? `AND "anime"."year" = ${year}` : ""}
                ${sort && sort === Sort.YEAR ? `AND "anime"."year" IS NOT NULL` : ""}
            `;
        } else {
            where = `
                WHERE
                (
                    ${query.length > 0 ? `$1` : `'%'`} ILIKE ANY("manga".synonyms)
                    OR  ${query.length > 0 ? `$1` : `'%'`}    % ANY("manga".synonyms)
                    OR "manga".title->>'english' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                    OR "manga".title->>'romaji' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                    OR "manga".title->>'native' ILIKE ${query.length > 0 ? "$1" : "'%'"}
                )
                ${formats.length > 0 ? `AND "manga"."format" IN (${formats.map((f) => `'${f}'`)})` : ""}
                ${genres && genres.length > 0 ? `AND ARRAY[${genres.map((g) => `'${g}'`)}] <@ "manga"."genres"` : ""}
                ${genresExcluded.length > 0 ? `AND NOT ARRAY[${genresExcluded.map((g) => `'${g}'`)}] <@ "manga"."genres"` : ""}
                ${tags && tags.length > 0 ? `AND ARRAY[${tags.map((g) => `'${g}'`)}] <@ "manga"."tags"` : ""}
                ${tagsExcluded.length > 0 ? `AND NOT ARRAY[${tagsExcluded.map((g) => `'${g}'`)}] <@ "manga"."tags"` : ""}
                ${year > 0 ? `AND "manga"."year" = ${year}` : ""}
                ${sort && sort === Sort.YEAR ? `AND "manga"."year" IS NOT NULL` : ""}
            `;
        }

        let [count, results] = [0, []];
        if (type === Type.ANIME) {
            const countQuery = `
                SELECT COUNT(*) FROM "anime"
                ${where}
            `;
            const sqlQuery = `
                SELECT * FROM "anime"
                ${where}
                ${
                    query.length > 0
                        ? `
                ORDER BY
                    (CASE WHEN "anime".title->>'english' IS NOT NULL THEN similarity(LOWER("anime".title->>'english'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "anime".title->>'romaji' IS NOT NULL THEN similarity(LOWER("anime".title->>'romaji'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "anime".title->>'native' IS NOT NULL THEN similarity(LOWER("anime".title->>'native'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN synonyms IS NOT NULL THEN most_similar(LOWER(${query.length > 0 ? `$1` : "'%'"}), synonyms) ELSE 0 END)
                        DESC
                `
                        : `
                ORDER BY
                    ${
                        sort === Sort.SCORE
                            ? `CAST("anime"."averageRating" AS NUMERIC)`
                            : sort === Sort.POPULARITY
                            ? `CAST("anime"."averagePopularity" AS NUMERIC)`
                            : sort === Sort.TOTAL_EPISODES
                            ? `CAST("anime"."totalEpisodes" AS NUMERIC)`
                            : sort === Sort.YEAR
                            ? `CAST("anime"."year" AS NUMERIC)`
                            : `
                        (CASE WHEN "anime".title->>'english' IS NOT NULL THEN similarity(LOWER("anime".title->>'english'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                        + CASE WHEN "anime".title->>'romaji' IS NOT NULL THEN similarity(LOWER("anime".title->>'romaji'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                        + CASE WHEN "anime".title->>'native' IS NOT NULL THEN similarity(LOWER("anime".title->>'native'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                        + CASE WHEN synonyms IS NOT NULL THEN most_similar(LOWER(${query.length > 0 ? `$1` : "'%'"}), synonyms) ELSE 0 END)
                    `
                    }
                        ${sortDirection === SortDirection.ASC ? "ASC" : "DESC"}
                `
                }
                LIMIT    ${perPage}
                OFFSET   ${skip}
            `;

            [count, results] = (await Promise.all([(await postgres.query(countQuery, query.length > 0 ? [`%${query}`] : [])).rows, (await postgres.query(sqlQuery, query.length > 0 ? [`%${query}`] : [])).rows])) as [any, any];

            if (sort === Sort.SCORE) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.averageRating) - Number(b.averageRating)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.averageRating) - Number(a.averageRating));
            }
            if (sort === Sort.POPULARITY) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.averagePopularity) - Number(b.averagePopularity)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.averagePopularity) - Number(a.averagePopularity));
            }
            if (sort === Sort.TOTAL_EPISODES) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime, b: Anime) => Number(a.totalEpisodes) - Number(b.totalEpisodes)) : results.sort((a: Anime, b: Anime) => Number(b.totalEpisodes) - Number(a.totalEpisodes));
            }
            if (sort === Sort.YEAR) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.year) - Number(b.year)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.year) - Number(a.year));
            }
        } else {
            const countQuery = `
                SELECT COUNT(*) FROM "manga"
                ${where}
            `;
            const sqlQuery = `
                SELECT * FROM "manga"
                ${where}
                ${
                    query.length > 0
                        ? `
                ORDER BY
                    (CASE WHEN "manga".title->>'english' IS NOT NULL THEN similarity(LOWER("manga".title->>'english'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "manga".title->>'romaji' IS NOT NULL THEN similarity(LOWER("manga".title->>'romaji'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "manga".title->>'native' IS NOT NULL THEN similarity(LOWER("manga".title->>'native'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN synonyms IS NOT NULL THEN most_similar(LOWER(${query.length > 0 ? `$1` : "'%'"}), synonyms) ELSE 0 END)
                        DESC
                `
                        : `
                ORDER BY
                    ${
                        sort === Sort.SCORE
                            ? `CAST("manga"."averageRating" AS NUMERIC)`
                            : sort === Sort.POPULARITY
                            ? `CAST("manga"."averagePopularity" AS NUMERIC)`
                            : sort === Sort.TOTAL_CHAPTERS
                            ? `CAST("manga"."totalChapters" AS NUMERIC)`
                            : sort === Sort.TOTAL_VOLUMES
                            ? `CAST("manga"."totalVolumes" AS NUMERIC)`
                            : sort === Sort.YEAR
                            ? `CAST("manga"."year" AS NUMERIC)`
                            : `
                    (CASE WHEN "manga".title->>'english' IS NOT NULL THEN similarity(LOWER("manga".title->>'english'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "manga".title->>'romaji' IS NOT NULL THEN similarity(LOWER("manga".title->>'romaji'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN "manga".title->>'native' IS NOT NULL THEN similarity(LOWER("manga".title->>'native'), LOWER(${query.length > 0 ? `$1` : "'%'"})) ELSE 0 END,
                    + CASE WHEN synonyms IS NOT NULL THEN most_similar(LOWER(${query.length > 0 ? `$1` : "'%'"}), synonyms) ELSE 0 END)
                    `
                    }
                        ${sortDirection === SortDirection.ASC ? "ASC" : "DESC"}
                `
                }
                LIMIT    ${perPage}
                OFFSET   ${skip}
            `;

            [count, results] = (await Promise.all([(await postgres.query(countQuery, query.length > 0 ? [`%${query}`] : [])).rows, (await postgres.query(sqlQuery, query.length > 0 ? [`%${query}`] : [])).rows])) as [any, any];

            if (sort === Sort.SCORE) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.averageRating) - Number(b.averageRating)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.averageRating) - Number(a.averageRating));
            }
            if (sort === Sort.POPULARITY) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.averagePopularity) - Number(b.averagePopularity)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.averagePopularity) - Number(a.averagePopularity));
            }
            if (sort === Sort.TOTAL_CHAPTERS) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Manga, b: Manga) => Number(a.totalChapters) - Number(b.totalChapters)) : results.sort((a: Manga, b: Manga) => Number(b.totalChapters) - Number(a.totalChapters));
            }
            if (sort === Sort.TOTAL_VOLUMES) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Manga, b: Manga) => Number(a.totalVolumes) - Number(b.totalVolumes)) : results.sort((a: Manga, b: Manga) => Number(b.totalVolumes) - Number(a.totalVolumes));
            }
            if (sort === Sort.YEAR) {
                results = sortDirection === SortDirection.ASC ? results.sort((a: Anime | Manga, b: Anime | Manga) => Number(a.year) - Number(b.year)) : results.sort((a: Anime | Manga, b: Anime | Manga) => Number(b.year) - Number(a.year));
            }
        }

        const total = Number((count as any)[0]?.count ?? 0);
        const lastPage = Math.ceil(Number(total) / perPage);

        return results;
    }

    const skip = page > 0 ? perPage * (page - 1) : 0;

    let where = `
        WHERE
        (
            EXISTS (
                SELECT 1
                FROM json_each(synonyms) AS s
                WHERE s.value LIKE '%' || $query || '%'
            )
            OR title->>'english' LIKE '%' || $query || '%'
            OR title->>'romaji' LIKE '%' || $query || '%'
            OR title->>'native' LIKE '%' || $query || '%'
        )
        ${formats?.length > 0 ? `AND "format" IN (${formats.map((f) => `'${f}'`).join(", ")})` : ""}
    `;

    if (genres && genres.length > 0) {
        let genreWhere = "";
        for (let i = 0; i < genres.length; i++) {
            genreWhere += `genres LIKE '%${genres[i]}%'`;
            if (i < genres.length - 1) {
                genreWhere += " AND ";
            }
        }
        where += `AND (${genreWhere})`;
    }

    if (genresExcluded && genresExcluded.length > 0) {
        let genreWhere = "";
        for (let i = 0; i < genresExcluded.length; i++) {
            genreWhere += `genres NOT LIKE '%${genresExcluded[i]}%'`;
            if (i < genresExcluded.length - 1) {
                genreWhere += " AND ";
            }
        }
        where += `AND (${genreWhere})`;
    }

    if (tags && tags.length > 0) {
        let tagsWhere = "";
        for (let i = 0; i < tags.length; i++) {
            tagsWhere += `tags LIKE '%${tags[i]}%'`;
            if (i < tags.length - 1) {
                tagsWhere += " AND ";
            }
        }
        where += `AND (${tagsWhere})`;
    }

    if (tags && tags.length > 0) {
        let tagsWhere = "";
        for (let i = 0; i < tags.length; i++) {
            tagsWhere += `tags NOT LIKE '%${tagsExcluded[i]}%'`;
            if (i < tags.length - 1) {
                tagsWhere += " AND ";
            }
        }
        where += `AND (${tagsWhere})`;
    }

    try {
        const results = sqlite
            .query<
                Db<Anime> | Db<Manga>,
                {
                    $query: string;
                    $limit: number;
                    $offset: number;
                }
            >(
                `SELECT *
                    FROM ${type === Type.ANIME ? "anime" : "manga"}
                    ${where}
                ORDER BY ${
                    sort === Sort.POPULARITY
                        ? "averagePopularity"
                        : sort === Sort.SCORE
                        ? "averageRating"
                        : sort === Sort.TITLE
                        ? "title->>'english'"
                        : sort === Sort.TOTAL_CHAPTERS
                        ? "totalChapters"
                        : sort === Sort.TOTAL_EPISODES
                        ? "totalEpisodes"
                        : sort === Sort.TOTAL_VOLUMES
                        ? "totalVolumes"
                        : sort === Sort.YEAR
                        ? "year"
                        : ""
                } ${sortDirection}
                LIMIT $limit OFFSET $offset`,
            )
            .all({ $query: query, $limit: perPage, $offset: skip });
        let parsedResults = results.map((data) => {
            try {
                if (data.type === Type.ANIME) {
                    Object.assign(data, {
                        title: JSON.parse(data.title),
                        season: data.season.replace(/"/g, ""),
                        mappings: JSON.parse(data.mappings),
                        synonyms: JSON.parse(data.synonyms),
                        rating: JSON.parse(data.rating),
                        popularity: JSON.parse(data.popularity),
                        relations: JSON.parse(data.relations),
                        genres: JSON.parse(data.genres),
                        tags: JSON.parse(data.tags),
                        episodes: JSON.parse(data.episodes),
                        artwork: JSON.parse(data.artwork),
                        characters: JSON.parse(data.characters),
                    });

                    return data;
                } else {
                    Object.assign(data, {
                        title: JSON.parse(data.title),
                        mappings: JSON.parse(data.mappings),
                        synonyms: JSON.parse(data.synonyms),
                        rating: JSON.parse(data.rating),
                        popularity: JSON.parse(data.popularity),
                        relations: JSON.parse(data.relations),
                        genres: JSON.parse(data.genres),
                        tags: JSON.parse(data.tags),
                        chapters: JSON.parse(data.chapters),
                        artwork: JSON.parse(data.artwork),
                        characters: JSON.parse(data.characters),
                    });

                    return data;
                }
            } catch (e) {
                return undefined;
            }
        });

        return parsedResults as unknown as ReturnType<T>;
    } catch (e) {
        console.error(e);
        return [];
    }
};

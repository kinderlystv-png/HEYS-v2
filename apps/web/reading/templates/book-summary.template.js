(function () {
    'use strict';

    // Копируйте через `pnpm reading:new`, а не вручную: команда также обновляет manifest.
    window.HEYS.Reading.registerBook({
        schemaVersion: 1,
        status: 'draft',
        id: 'author-book-title',
        title: 'Название книги',
        author: 'Имя автора',
        year: 2000,
        editorialRank: 100,
        verdict: 'TODO: ясный вывод о книге.',
        practicalValue: 'TODO: что читатель сможет применить.',
        topics: ['thinking'],
        tags: ['decisions', 'mistakes', 'systems'],
        coverTone: 'violet',
        blocks: [],
        sources: [],
    });
})();

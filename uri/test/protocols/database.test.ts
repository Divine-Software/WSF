import { DBQuery, q } from '../../src';

describe('query', () => {
    const withValues = (value: unknown) => {
        return `[${value}]`;
    }

    it('build simple queries', () => {
        expect.assertions(7);

        expect(q`select 10`.toString()).toBe('select 10');

        expect(q`select ${10}`.toString()).toBe('select «10»');
        expect(q`select ${10}`.toString(withValues)).toBe('select [10]');

        expect(q`select ${10}!`.toString()).toBe('select «10»!');
        expect(q`select ${10}!`.toString(withValues)).toBe('select [10]!');

        expect(q`${10}${'a'} ${20}`.toString()).toBe('«10»«a» «20»');
        expect(q`${10}${'a'} ${20}`.toString(withValues)).toBe('[10][a] [20]');
    });

    it('handles nested queries', () => {
        expect.assertions(21);

        const nest0 = q`nest10`;
        const nest1 = q`nest${10}`;
        const nest2 = q`${10}`;
        const nest3 = q`nest${10}nest`;
        const nest4 = q`nest${10}${20} ${30}nest`;
        const nest5 = q`${10} ${20}${30}`;
        const nest6 = q`${nest5}`;

        expect(q`${nest0}`.toString(withValues)).toBe('nest10');
        expect(q`${nest1}`.toString(withValues)).toBe('nest[10]');
        expect(q`${nest2}`.toString(withValues)).toBe('[10]');
        expect(q`${nest3}`.toString(withValues)).toBe('nest[10]nest');
        expect(q`${nest4}`.toString(withValues)).toBe('nest[10][20] [30]nest');
        expect(q`${nest5}`.toString(withValues)).toBe('[10] [20][30]');
        expect(q`${nest6}`.toString(withValues)).toBe('[10] [20][30]');

        expect(q`${90}${nest0}!${91}`.toString(withValues)).toBe('[90]nest10![91]');
        expect(q`${90}${nest1}!${91}`.toString(withValues)).toBe('[90]nest[10]![91]');
        expect(q`${90}${nest2}!${91}`.toString(withValues)).toBe('[90][10]![91]');
        expect(q`${90}${nest3}!${91}`.toString(withValues)).toBe('[90]nest[10]nest![91]');
        expect(q`${90}${nest4}!${91}`.toString(withValues)).toBe('[90]nest[10][20] [30]nest![91]');
        expect(q`${90}${nest5}!${91}`.toString(withValues)).toBe('[90][10] [20][30]![91]');
        expect(q`${90}${nest6}!${91}`.toString(withValues)).toBe('[90][10] [20][30]![91]');

        expect(q`${90}!${nest0}${91}`.toString(withValues)).toBe('[90]!nest10[91]');
        expect(q`${90}!${nest1}${91}`.toString(withValues)).toBe('[90]!nest[10][91]');
        expect(q`${90}!${nest2}${91}`.toString(withValues)).toBe('[90]![10][91]');
        expect(q`${90}!${nest3}${91}`.toString(withValues)).toBe('[90]!nest[10]nest[91]');
        expect(q`${90}!${nest4}${91}`.toString(withValues)).toBe('[90]!nest[10][20] [30]nest[91]');
        expect(q`${90}!${nest5}${91}`.toString(withValues)).toBe('[90]![10] [20][30][91]');
        expect(q`${90}!${nest6}${91}`.toString(withValues)).toBe('[90]![10] [20][30][91]');
    });
});

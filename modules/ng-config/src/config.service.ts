/**
 * @license
 * Copyright DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found under the LICENSE file in the root directory of this source tree.
 */

import { EventEmitter, Inject, Injectable, Injector, Optional } from '@angular/core';

import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { map, mapTo, share, take, tap } from 'rxjs/operators';

import { CONFIG_PROVIDER, ConfigProvider } from './config-provider';
import { CONFIG_OPTIONS, ConfigOptions } from './config-options';
import { ConfigSection, ConfigValue } from './config-value';
import { Logger, NG_CONFIG_LOGGER } from './logger';
import { equalDeep, mapOptionValues } from './util';

@Injectable({
    providedIn: 'root'
})
export class ConfigService {
    readonly valueChanges: Observable<ConfigSection>;

    private readonly optionsSuffix: string;
    private readonly options: ConfigOptions;

    private loading = false;
    private activated = false;

    private currentLoad = new Observable<ConfigSection>();
    private currentLoadSubscription?: Subscription | null;
    private loadedConfig: ConfigSection = {};
    private optionsRecord = new Map<string, unknown>();

    get providers(): ConfigProvider[] {
        return this.sortedConfigProviders;
    }

    private readonly sortedConfigProviders: ConfigProvider[];
    private readonly logger: Logger;

    constructor(
        @Inject(CONFIG_PROVIDER) configProviders: ConfigProvider[],
        private readonly injector: Injector,
        @Optional() @Inject(CONFIG_OPTIONS) options?: ConfigOptions,
        @Optional() @Inject(NG_CONFIG_LOGGER) logger?: Logger
    ) {
        this.sortedConfigProviders = configProviders.reverse();
        this.options = options || {};
        this.optionsSuffix = this.options.optionsSuffix || 'Options';
        this.valueChanges = new EventEmitter<ConfigSection>();

        if (logger) {
            this.logger = logger;
        } else {
            this.logger = {
                debug: (message: string, data: { [key: string]: unknown }) => {
                    if (data) {
                        // eslint-disable-next-line no-console
                        console.log(`${message}, data: `, data);
                    } else {
                        // eslint-disable-next-line no-console
                        console.log(message);
                    }
                }
            };
        }

        this.currentLoad = this.initLoad();
        this.subscribeCurrentLoad(false);
    }

    ensureInitialized(): Observable<boolean> {
        if (this.activated) {
            return of(this.activated);
        }

        return this.currentLoad.pipe(
            tap((config) => {
                this.activateConfig(config, false);
            }),
            map(() => this.activated)
        );
    }

    reload(): Observable<void> {
        this.currentLoad = this.initLoad();
        this.subscribeCurrentLoad(true);

        return this.currentLoad.pipe(mapTo(void 0));
    }

    getValue(key: string): ConfigValue {
        return this.getConfigValue(key, this.loadedConfig);
    }

    mapType<T>(optionsClass: new () => T): T {
        const optionsObj = this.injector.get<T>(optionsClass, new optionsClass());
        const key = this.getKeyFromClassName(optionsClass.name);
        this.mapObject(key, optionsObj);

        return optionsObj;
    }

    mapObject<T>(key: string, optionsObj: T): T {
        const cachedOptions = this.optionsRecord.get(key) as T;

        if (cachedOptions != null) {
            if (cachedOptions === optionsObj) {
                return cachedOptions;
            }

            this.optionsRecord.delete(key);
        }

        const configValue = this.getValue(key);

        if (configValue == null || Array.isArray(configValue) || typeof configValue !== 'object') {
            return optionsObj;
        }

        mapOptionValues(optionsObj as never, configValue);

        this.optionsRecord.set(key, optionsObj);

        return optionsObj;
    }

    private initLoad(): Observable<ConfigSection> {
        if (this.currentLoadSubscription) {
            this.currentLoadSubscription.unsubscribe();
            this.currentLoadSubscription = null;
        }

        if (!this.loading) {
            this.log('Cconfiguration loading started.');

            this.loading = true;
        }

        return forkJoin(
            this.providers.map((configProvider) => {
                const providerName = configProvider.name;

                const loadObs = configProvider.load().pipe(
                    tap((config) => {
                        this.log(providerName, config);
                    }),
                    share()
                );

                return loadObs.pipe(take(1), share());
            })
        ).pipe(
            map((configs) => {
                let mergedConfig: ConfigSection = {};

                configs.forEach((config) => {
                    mergedConfig = { ...mergedConfig, ...config };
                });

                return mergedConfig;
            })
        );
    }

    private subscribeCurrentLoad(reActivate: boolean): void {
        this.currentLoadSubscription = this.currentLoad.subscribe(
            (config) => {
                this.activateConfig(config, reActivate);
            },
            () => {
                this.loading = false;
            }
        );
    }

    private activateConfig(config: ConfigSection, reActivate: boolean): void {
        this.loading = false;

        if (this.activated && !reActivate) {
            return;
        }

        if (!equalDeep(config, this.loadedConfig)) {
            this.optionsRecord.clear();
            this.loadedConfig = config;

            this.activated = true;
            this.log('Configuration loading completed.');

            (this.valueChanges as EventEmitter<ConfigSection>).emit(config);
        } else {
            this.activated = true;
            this.log('Configuration loading completed.');
        }
    }

    private getConfigValue(key: string, config: ConfigSection): ConfigValue {
        const keyArray = key.split(/:/);
        const result = keyArray.reduce((acc, current: string) => acc && acc[current], config);
        if (result === undefined) {
            return null;
        }

        return result;
    }

    private getKeyFromClassName(className: string): string {
        let normalizedKey = className;
        if (normalizedKey.length > this.optionsSuffix.length && normalizedKey.endsWith(this.optionsSuffix)) {
            normalizedKey = normalizedKey.substr(0, normalizedKey.length - this.optionsSuffix.length);
        }

        normalizedKey = normalizedKey[0].toLowerCase() + normalizedKey.substr(1);

        return normalizedKey;
    }

    private log(msg: string, data?: { [key: string]: unknown }): void {
        if (!this.options.debug) {
            return;
        }

        this.logger.debug(`[ConfigService] ${msg}`, data);
    }
}

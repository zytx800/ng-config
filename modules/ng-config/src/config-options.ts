/**
 * @license
 * Copyright DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found under the LICENSE file in the root directory of this source tree.
 */

import { InjectionToken } from '@angular/core';

/**
 * Options interface for `ConfigService`.
 */
export interface ConfigOptions {
    /**
     * Options suffix for options class. Default is 'Options'.
     */
    optionsSuffix?: string;

    /**
     * Set true to log debug information.
     */
    debug?: boolean;
}

export const CONFIG_OPTIONS = new InjectionToken<ConfigOptions>('ConfigOptions');
